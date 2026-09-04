import { Injectable, Logger } from '@nestjs/common';
import { AdminAction, Prisma } from '@prisma/client';
import {
  NOTIFICATION_TEMPLATE_KEYS,
  SETTINGS_SECTIONS,
  storeSettingsSchema,
} from '@bazaar/shared';
import type {
  MessageTemplate,
  NotificationTemplateKey,
  PublicStoreSettings,
  SettingsPatchInput,
  SettingsSection,
  StoreSettings,
} from '@bazaar/shared';

import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogService } from './activity-log.service';

/**
 * The messages the store sends before anyone edits them.
 *
 * `{{placeholder}}` names match `TEMPLATE_VARIABLES` in @bazaar/shared, which
 * is what the settings editor lists beside each field - so the variables an
 * operator is offered are exactly the ones substitution understands.
 */
const DEFAULT_TEMPLATES: Record<NotificationTemplateKey, MessageTemplate> = {
  'order.confirmed': {
    key: 'order.confirmed',
    emailSubject: 'Your Bazaar order {{order_number}} is confirmed',
    emailBody:
      'Hi {{customer_name}},\n\nWe have your order {{order_number}} for {{order_total}}. We will let you know the moment it ships.\n\nTrack it any time: {{order_url}}',
    smsBody: 'Bazaar: order {{order_number}} confirmed ({{order_total}}). Track: {{order_url}}',
    emailEnabled: true,
    smsEnabled: false,
  },
  'order.shipped': {
    key: 'order.shipped',
    emailSubject: 'Order {{order_number}} is on its way',
    emailBody:
      'Hi {{customer_name}},\n\n{{carrier}} has your parcel. The consignment number is {{tracking_number}}.\n\nFollow it here: {{tracking_url}}',
    smsBody: 'Bazaar: {{order_number}} shipped via {{carrier}}. Tracking: {{tracking_number}}',
    emailEnabled: true,
    smsEnabled: true,
  },
  'order.delivered': {
    key: 'order.delivered',
    emailSubject: 'Your Bazaar order has arrived',
    emailBody:
      'Hi {{customer_name}},\n\n{{order_number}} has been delivered. If anything is not right, reply to this email.\n\nWhen you have had a chance to try it: {{review_url}}',
    smsBody: 'Bazaar: {{order_number}} delivered. Thank you!',
    emailEnabled: true,
    smsEnabled: false,
  },
  'order.cancelled': {
    key: 'order.cancelled',
    emailSubject: 'Order {{order_number}} has been cancelled',
    emailBody:
      'Hi {{customer_name}},\n\n{{order_number}} has been cancelled.\n\nReason: {{reason}}\n\nAnything already paid is on its way back to you.',
    smsBody: 'Bazaar: {{order_number}} cancelled. Any payment will be refunded.',
    emailEnabled: true,
    smsEnabled: false,
  },
  'order.refunded': {
    key: 'order.refunded',
    emailSubject: 'Refund issued for {{order_number}}',
    emailBody:
      'Hi {{customer_name}},\n\nWe have sent {{refund_amount}} back for {{order_number}}. Bank timings mean it can take a few working days to appear.',
    smsBody: 'Bazaar: {{refund_amount}} refunded for {{order_number}}.',
    emailEnabled: true,
    smsEnabled: false,
  },
  'contact.reply': {
    key: 'contact.reply',
    emailSubject: 'Re: {{subject}}',
    emailBody: 'Hi {{name}},\n\n{{reply_body}}\n\n- Bazaar support',
    smsBody: null,
    emailEnabled: true,
    smsEnabled: false,
  },
};

/**
 * The shape the store starts with, and the shape a missing section falls back
 * to. Defined here rather than only in the seed so a fresh database, a database
 * seeded before a section existed, and a database somebody deleted a row from
 * all behave the same: settings always resolve to something valid.
 */
export const DEFAULT_SETTINGS: StoreSettings = {
  general: {
    name: 'Bazaar',
    tagline: 'Everything you need, delivered across Nepal.',
    contactEmail: 'support@bazaar.com.np',
    contactPhone: '+9779800000000',
    logoUrl: null,
    faviconUrl: null,
  },
  currency: { default: 'NPR', supported: ['NPR', 'USD'], usdToNpr: 133 },
  tax: { rate: 0.13, label: 'VAT', inclusive: false, registrationNumber: null },
  shipping: {
    freeShippingThreshold: 5000,
    defaultFlatRate: 150,
    defaultCarrier: 'NCM',
    zones: [
      {
        id: 'valley',
        name: 'Kathmandu Valley',
        districts: ['Kathmandu', 'Lalitpur', 'Bhaktapur'],
        flatRate: 100,
        freeShippingThreshold: 3000,
        estimatedDaysMin: 1,
        estimatedDaysMax: 2,
        isActive: true,
      },
      {
        id: 'outside-valley',
        name: 'Rest of Nepal',
        districts: [],
        flatRate: 200,
        freeShippingThreshold: 5000,
        estimatedDaysMin: 3,
        estimatedDaysMax: 7,
        isActive: true,
      },
    ],
  },
  payments: {
    enabled: ['COD', 'ESEWA', 'KHALTI'],
    available: [
      'ESEWA',
      'KHALTI',
      'CONNECTIPS',
      'FONEPAY',
      'IME_PAY',
      'STRIPE',
      'PAYPAL',
      'BANK_TRANSFER',
      'COD',
    ],
    codMaxOrderValue: 25_000,
    testMode: true,
  },
  social: { facebook: null, instagram: null, tiktok: null, youtube: null },
  maintenance: { enabled: false, message: 'We will be back shortly.' },
  notifications: {
    templates: NOTIFICATION_TEMPLATE_KEYS.map((key) => DEFAULT_TEMPLATES[key]),
  },
};

/**
 * Store configuration, assembled from the `store_settings` key/value table.
 *
 * One row per section rather than one blob, for a reason that only shows up
 * with two people in the panel: an operator saving the shipping tab and another
 * saving the tax tab a second later would, with a single document, have the
 * second write erase the first. Sections make those two writes touch different
 * rows and both survive.
 *
 * Reads merge over `DEFAULT_SETTINGS`, so a section added in a later release is
 * populated for stores seeded before it existed, and a hand-edited row that no
 * longer parses degrades to the default with a warning rather than taking the
 * storefront down - settings feed checkout, and checkout must not be blocked by
 * a bad JSON blob.
 */
@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityLogService,
  ) {}

  async getAll(): Promise<StoreSettings> {
    const rows = await this.prisma.storeSetting
      .findMany({ where: { key: { in: SETTINGS_SECTIONS.map(settingKey) } } })
      .catch((error: unknown) => {
        this.logger.warn(
          `Could not read store settings, using defaults: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return [] as Array<{ key: string; value: Prisma.JsonValue }>;
      });

    const stored: Record<string, unknown> = {};

    for (const row of rows) {
      const section = sectionFromKey(row.key);
      if (section) stored[section] = row.value;
    }

    const merged = { ...DEFAULT_SETTINGS };

    for (const section of SETTINGS_SECTIONS) {
      const value = stored[section];
      if (value === undefined || value === null) continue;

      // Parsed per section: one malformed row falls back on its own rather
      // than dragging every other section down with it.
      const parsed = storeSettingsSchema.shape[section].safeParse(value);

      if (parsed.success) {
        Object.assign(merged, { [section]: parsed.data });
      } else {
        this.logger.warn(
          `store_settings["${settingKey(section)}"] did not validate - using the default. ${parsed.error.issues[0]?.message ?? ''}`,
        );
      }
    }

    return merged;
  }

  async getSection<S extends SettingsSection>(section: S): Promise<StoreSettings[S]> {
    const settings = await this.getAll();
    return settings[section];
  }

  /**
   * Writes the sections present in the patch, leaving the rest untouched.
   *
   * The before/after diff is captured per section, so the activity log says
   * "tax.rate 0.13 -> 0.15" rather than "settings changed".
   */
  async update(patch: SettingsPatchInput, adminId: string): Promise<StoreSettings> {
    const current = await this.getAll();
    const sections = Object.keys(patch) as SettingsSection[];

    await this.prisma.$transaction(
      sections.map((section) => {
        const value = patch[section] as unknown as Prisma.InputJsonValue;

        return this.prisma.storeSetting.upsert({
          where: { key: settingKey(section) },
          create: { key: settingKey(section), value, updatedBy: adminId },
          update: { value, updatedBy: adminId },
        });
      }),
    );

    for (const section of sections) {
      await this.activity.record({
        action: AdminAction.UPDATE,
        entityType: 'store_setting',
        entityId: settingKey(section),
        summary: `Updated ${section} settings`,
        before: flatten(current[section]),
        after: flatten(patch[section]),
      });
    }

    return this.getAll();
  }

  /**
   * The slice the storefront may read without a token.
   *
   * An explicit projection rather than a delete-list: a secret added to a
   * section in a later release is excluded by default, which is the direction
   * this should fail in. Gateway credentials never live here at all - they are
   * environment variables - but `testMode` and the enabled list would still
   * tell an attacker more than they need.
   */
  async getPublic(): Promise<PublicStoreSettings> {
    const settings = await this.getAll();

    return {
      general: settings.general,
      currency: settings.currency,
      tax: {
        rate: settings.tax.rate,
        label: settings.tax.label,
        inclusive: settings.tax.inclusive,
      },
      shipping: {
        freeShippingThreshold: settings.shipping.freeShippingThreshold,
        defaultFlatRate: settings.shipping.defaultFlatRate,
      },
      payments: { enabled: settings.payments.enabled },
      social: settings.social,
      maintenance: settings.maintenance,
    };
  }
}

/* -------------------------------------------------------------------------- */

/** Section names map to the `store.<section>` keys the seed already writes. */
function settingKey(section: SettingsSection): string {
  return `store.${section}`;
}

function sectionFromKey(key: string): SettingsSection | null {
  const section = key.replace(/^store\./, '') as SettingsSection;
  return SETTINGS_SECTIONS.includes(section) ? section : null;
}

/** The diff builder compares flat records, so a section object is passed as-is. */
function flatten(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
