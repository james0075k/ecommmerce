import { Injectable, Logger } from '@nestjs/common';
import { AdminAction, Prisma } from '@prisma/client';
import type {
  ActivityDetails,
  ActivityDiffField,
  ActivityLogQueryInput,
  AdminActivityEntry,
  Paginated,
} from '@bazaar/shared';

import { PrismaService } from '../prisma/prisma.service';
import { RequestContextService } from '../common/request-context';

/** What a caller hands in; IP, user agent and admin id are filled in for it. */
export interface RecordActivityInput {
  action: AdminAction;
  entityType: string;
  entityId?: string | null;
  summary?: string;
  /** Extra context beyond the diff - a reason, a count, an export filter. */
  meta?: Record<string, unknown>;
  /** Snapshots to diff. Pass both for an update, one for a create or delete. */
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  /** Overrides the ambient admin - used by the interceptor, rarely elsewhere. */
  adminId?: string | null;
  /**
   * Request details, when the caller already has them.
   *
   * The audit interceptor passes these explicitly because its `tap` runs when
   * the response observable emits, which is a microtask continuation outside
   * the AsyncLocalStorage scope the request opened - so `snapshot()` would come
   * back empty there and every interceptor-written row would lose its IP.
   * Services called from inside the handler are still inside the scope and pass
   * nothing.
   */
  ipAddress?: string | null;
  userAgent?: string | null;
  /**
   * False to leave the request unmarked, so the blanket interceptor still logs
   * its generic row. Only the interceptor itself uses this.
   */
  markHandled?: boolean;
}

/**
 * Fields that must never be written to the audit trail even if a caller passes
 * them in a snapshot. The log is read by more people than the table it
 * describes, and a password hash in a diff is a password hash in a screenshot.
 */
const REDACTED = new Set([
  'password',
  'passwordHash',
  'confirmPassword',
  'currentPassword',
  'newPassword',
  'token',
  'accessToken',
  'refreshToken',
  'tokenHash',
  'twoFactorSecret',
  'secret',
  'apiKey',
  'cardNumber',
  'cvv',
]);

const MAX_VALUE_LENGTH = 500;
const MAX_DIFF_FIELDS = 40;

/**
 * Who did what, to which record, from where.
 *
 * Two properties matter more than completeness. First, writing to this table
 * must never fail the action it describes: an order that moved to SHIPPED is
 * shipped whether or not the log row landed, so every write here swallows its
 * own error and logs a warning. Second, a diff has to be readable a year later
 * by someone who was not there - which means comparing snapshots and keeping
 * only the fields that actually moved, rather than dumping two whole rows and
 * leaving the reader to spot the difference.
 */
@Injectable()
export class ActivityLogService {
  private readonly logger = new Logger(ActivityLogService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly context: RequestContextService,
  ) {}

  /**
   * Records one action. Fire-and-forget by design - callers do not await a
   * result they cannot act on, and the returned promise never rejects.
   */
  async record(input: RecordActivityInput): Promise<void> {
    try {
      const ambient = this.context.snapshot();
      const request = this.context.get();

      const ipAddress = input.ipAddress ?? ambient.ipAddress;
      const userAgent = input.userAgent ?? ambient.userAgent;
      const userId = ambient.userId;

      // Tells the blanket audit interceptor that this request has already been
      // described properly, so it does not add a second, vaguer row for it.
      if (request && input.markHandled !== false) request.logged = true;

      const diff = buildDiff(input.before ?? null, input.after ?? null);

      const details: ActivityDetails = {
        ...(input.summary && { summary: input.summary }),
        ...(diff.length > 0 && { diff }),
        ...(request && { method: request.method, path: request.path }),
        ...(input.meta && sanitiseObject(input.meta)),
      };

      await this.prisma.adminActivityLog.create({
        data: {
          adminId: input.adminId ?? userId,
          action: input.action,
          entityType: input.entityType,
          entityId: input.entityId ?? null,
          details: Object.keys(details).length > 0 ? (details as Prisma.InputJsonValue) : undefined,
          ipAddress,
          userAgent,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Could not write activity log for ${input.action} ${input.entityType}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async list(query: ActivityLogQueryInput): Promise<Paginated<AdminActivityEntry>> {
    const where: Prisma.AdminActivityLogWhereInput = {
      ...(query.adminId && { adminId: query.adminId }),
      ...(query.action && { action: query.action as AdminAction }),
      ...(query.entityType && { entityType: query.entityType }),
      ...(query.entityId && { entityId: query.entityId }),
      ...((query.from || query.to) && {
        createdAt: {
          ...(query.from && { gte: query.from }),
          ...(query.to && { lte: endOfDay(query.to) }),
        },
      }),
    };

    const [rows, total] = await Promise.all([
      this.prisma.adminActivityLog.findMany({
        where,
        include: { admin: { select: { fullName: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.adminActivityLog.count({ where }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / query.limit));

    return {
      items: rows.map((row) => ({
        id: row.id,
        adminId: row.adminId,
        adminName: row.admin?.fullName ?? null,
        adminEmail: row.admin?.email ?? null,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        details: (row.details as ActivityDetails | null) ?? null,
        ipAddress: row.ipAddress,
        userAgent: row.userAgent,
        createdAt: row.createdAt.toISOString(),
      })),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages,
        hasNext: query.page < totalPages,
        hasPrev: query.page > 1,
      },
    };
  }

  /** Every entry touching one record, for the "history" tab on a detail page. */
  async forEntity(entityType: string, entityId: string, limit = 20): Promise<AdminActivityEntry[]> {
    const { items } = await this.list({
      entityType,
      entityId,
      page: 1,
      limit,
    } as ActivityLogQueryInput);

    return items;
  }
}

/* -------------------------------------------------------------------------- */
/*  Diffing                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Reduces two snapshots to the fields that changed.
 *
 * Comparison is by serialised value rather than by reference, so a Decimal
 * re-read from Postgres does not read as "changed" against the number that was
 * written, and an array whose order is identical is not flagged. Fields present
 * on only one side are still reported, with `undefined` on the missing side -
 * a create is exactly that case, and showing every initial value is the point.
 */
export function buildDiff(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): ActivityDiffField[] {
  if (!before && !after) return [];

  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const diff: ActivityDiffField[] = [];

  for (const key of keys) {
    if (REDACTED.has(key)) continue;
    if (diff.length >= MAX_DIFF_FIELDS) break;

    const from = normalise(before?.[key]);
    const to = normalise(after?.[key]);

    if (stableString(from) === stableString(to)) continue;

    diff.push({ field: key, before: from, after: to });
  }

  return diff;
}

/**
 * Flattens the values Prisma hands back into something JSONB can hold and a
 * human can read: Decimals become numbers, Dates become ISO strings, and long
 * text is truncated so one HTML description does not become the whole row.
 */
function normalise(value: unknown): unknown {
  if (value === null || value === undefined) return value ?? null;

  if (value instanceof Date) return value.toISOString();
  if (Prisma.Decimal.isDecimal(value)) return value.toNumber();

  if (typeof value === 'string') {
    return value.length > MAX_VALUE_LENGTH ? `${value.slice(0, MAX_VALUE_LENGTH)}...` : value;
  }

  if (Array.isArray(value)) return value.slice(0, 50).map((entry) => normalise(entry));

  if (typeof value === 'object') {
    return sanitiseObject(value as Record<string, unknown>);
  }

  return value;
}

function sanitiseObject(input: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (REDACTED.has(key)) {
      output[key] = '[redacted]';
      continue;
    }
    output[key] = normalise(value);
  }

  return output;
}

/** Order-independent for objects, so key order does not read as a change. */
function stableString(value: unknown): string {
  return JSON.stringify(value, (_key, entry: unknown) => {
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      return Object.fromEntries(
        Object.entries(entry as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
      );
    }
    return entry;
  });
}

function endOfDay(date: Date): Date {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end;
}

export { REDACTED as REDACTED_FIELDS };
