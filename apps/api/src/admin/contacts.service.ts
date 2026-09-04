import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AdminAction, ContactStatus, Prisma } from '@prisma/client';
import type {
  AdminContactMessage,
  AdminContactQueryInput,
  ContactMessageInput,
  ContactReplyInput,
  ContactStatusInput,
  Paginated,
} from '@bazaar/shared';

import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../notifications/mail.service';
import { ActivityLogService } from './activity-log.service';
import { AdminNotificationsService } from './admin-notifications.service';

const WITH_ADMIN = {
  admin: { select: { fullName: true } },
} satisfies Prisma.ContactMessageInclude;

/**
 * The contact form, and the queue it feeds.
 *
 * `status` is the only state this has, and it moves in one direction for a
 * reason: NEW means nobody has looked, READ means someone has, REPLIED means
 * someone answered. Sending a reply is what sets REPLIED - an operator cannot
 * mark a message answered without answering it, which is the difference between
 * a queue that tells the truth and one that gets gamed to zero.
 */
@Injectable()
export class ContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly activity: ActivityLogService,
    private readonly notifications: AdminNotificationsService,
  ) {}

  /** The public form. Open to guests, so it is rate-limited at the controller. */
  async submit(dto: ContactMessageInput): Promise<{ id: string; received: true }> {
    const message = await this.prisma.contactMessage.create({
      data: {
        name: dto.name,
        email: dto.email,
        phone: dto.phone ?? null,
        subject: dto.subject,
        message: dto.message,
      },
      select: { id: true, name: true, subject: true },
    });

    await this.notifications.contactReceived(message);

    return { id: message.id, received: true };
  }

  async list(query: AdminContactQueryInput): Promise<Paginated<AdminContactMessage>> {
    const where: Prisma.ContactMessageWhereInput = {
      ...(query.status && { status: query.status }),
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' as const } },
          { email: { contains: query.search, mode: 'insensitive' as const } },
          { subject: { contains: query.search, mode: 'insensitive' as const } },
          { message: { contains: query.search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [rows, total] = await Promise.all([
      this.prisma.contactMessage.findMany({
        where,
        include: WITH_ADMIN,
        orderBy: { createdAt: query.sort === 'oldest' ? 'asc' : 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.contactMessage.count({ where }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / query.limit));

    return {
      items: rows.map(toContactMessage),
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

  async findOne(id: string): Promise<AdminContactMessage> {
    const message = await this.prisma.contactMessage.findUnique({
      where: { id },
      include: WITH_ADMIN,
    });

    if (!message) throw new NotFoundException('No such message.');

    return toContactMessage(message);
  }

  /**
   * Marks a message read or unread.
   *
   * REPLIED is not settable here: it is a statement about an email having been
   * sent, and `reply()` is the only thing that can honestly make it.
   */
  async setStatus(id: string, dto: ContactStatusInput): Promise<AdminContactMessage> {
    if (dto.status === ContactStatus.REPLIED) {
      throw new BadRequestException('Send a reply to mark a message replied.');
    }

    const existing = await this.prisma.contactMessage.findUnique({
      where: { id },
      select: { status: true, email: true },
    });

    if (!existing) throw new NotFoundException('No such message.');

    const updated = await this.prisma.contactMessage.update({
      where: { id },
      data: { status: dto.status },
      include: WITH_ADMIN,
    });

    await this.activity.record({
      action: AdminAction.UPDATE,
      entityType: 'contact_message',
      entityId: id,
      summary: `Message from ${existing.email} marked ${dto.status}`,
      before: { status: existing.status },
      after: { status: dto.status },
    });

    return toContactMessage(updated);
  }

  /**
   * Answers a message.
   *
   * The status is written whether or not the mail provider answered, and the
   * outcome is recorded in the activity log. The alternative - only marking it
   * replied on a confirmed send - reads better on paper and works badly in
   * practice: with no RESEND_API_KEY configured every reply would stay in the
   * queue forever, and an operator would answer each one twice.
   */
  async reply(id: string, adminId: string, dto: ContactReplyInput): Promise<AdminContactMessage> {
    const message = await this.prisma.contactMessage.findUnique({ where: { id } });
    if (!message) throw new NotFoundException('No such message.');

    const subject = dto.subject ?? `Re: ${message.subject}`;

    const delivered = await this.mail
      .sendAdminMessage(message.email, message.name, subject, dto.body)
      .then(() => true)
      .catch(() => false);

    const updated = await this.prisma.contactMessage.update({
      where: { id },
      data: {
        status: ContactStatus.REPLIED,
        repliedAt: new Date(),
        repliedBy: adminId,
      },
      include: WITH_ADMIN,
    });

    await this.activity.record({
      action: AdminAction.UPDATE,
      entityType: 'contact_message',
      entityId: id,
      summary: `Replied to ${message.email}`,
      before: { status: message.status, repliedAt: message.repliedAt },
      after: { status: ContactStatus.REPLIED, repliedAt: updated.repliedAt },
      meta: { subject, delivered, body: dto.body.slice(0, 500) },
    });

    return toContactMessage(updated);
  }

  /** Counts per status, for the filter chips and the sidebar badge. */
  async counts(): Promise<Record<ContactStatus, number>> {
    const grouped = await this.prisma.contactMessage.groupBy({
      by: ['status'],
      _count: { _all: true },
    });

    const counts: Record<ContactStatus, number> = {
      [ContactStatus.NEW]: 0,
      [ContactStatus.READ]: 0,
      [ContactStatus.REPLIED]: 0,
    };

    for (const row of grouped) counts[row.status] = row._count._all;

    return counts;
  }
}

/* -------------------------------------------------------------------------- */

type ContactRow = Prisma.ContactMessageGetPayload<{ include: typeof WITH_ADMIN }>;

function toContactMessage(row: ContactRow): AdminContactMessage {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    subject: row.subject,
    message: row.message,
    status: row.status,
    repliedAt: row.repliedAt?.toISOString() ?? null,
    repliedBy: row.repliedBy,
    repliedByName: row.admin?.fullName ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
