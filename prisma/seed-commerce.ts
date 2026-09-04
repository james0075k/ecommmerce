/**
 * Demo commerce data: customers, orders, payments, page views, coupons and
 * contact messages.
 *
 * Split from `seed.ts` because it answers a different question. The catalog
 * seed exists so the storefront has something to show; this exists so the admin
 * panel has something to *measure* - a dashboard with no orders behind it looks
 * identical whether the queries are right or wrong.
 *
 * Everything is deterministic (one seeded PRNG, no `Date.now()` in the data
 * itself) and idempotent on a natural key, so re-running produces the same
 * store rather than a second copy of it. Dates are relative to the run, though,
 * so "the last 30 days" is always populated no matter when it is seeded.
 */
import { PrismaClient, ContactStatus, CouponType, OrderStatus, PaymentMethod, PaymentStatus, RefundStatus, UserRole } from '@prisma/client';
import * as argon2 from 'argon2';

const DAY_MS = 24 * 60 * 60 * 1000;
/** How far back the demo history runs. Long enough for the 90-day preset. */
const HISTORY_DAYS = 120;

/** The same LCG the catalog seed uses, with a different seed. */
function makeRandom(seed: number): () => number {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

/**
 * The same Argon2id parameters AuthService hashes with. `verify` reads the cost
 * out of the encoded hash either way, so this is for consistency rather than
 * correctness - but a seeded password that is cheaper than a registered one is
 * exactly the kind of difference that goes unnoticed until it matters.
 */
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

const random = makeRandom(19_920_311);

function between(min: number, max: number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

function pick<T>(values: readonly T[]): T {
  const value = values[Math.floor(random() * values.length)];
  if (value === undefined) throw new Error('pick() called with an empty list');
  return value;
}

/** True with the given probability. */
function chance(probability: number): boolean {
  return random() < probability;
}

/**
 * A timestamp `days` back, at roughly the given hour.
 *
 * Clamped so a past date never lands in the future. Without this, seeding at
 * 09:00 with `daysAgo(0, 21)` writes an order timestamped 21:00 *today* - which
 * the dashboard correctly excludes from "revenue today" because it has not
 * happened yet, and which then reads as a broken query rather than a broken
 * fixture. Negative `days` is still allowed on purpose: coupon validity windows
 * genuinely need future dates.
 */
function daysAgo(days: number, hour = 12): Date {
  const date = new Date(Date.now() - days * DAY_MS);
  date.setHours(hour, between(0, 59), between(0, 59), 0);

  if (days >= 0 && date.getTime() > Date.now()) {
    // A few minutes ago, so it is unambiguously inside "today".
    return new Date(Date.now() - between(1, 30) * 60_000);
  }

  return date;
}

/* -------------------------------------------------------------------------- */
/*  Fixtures                                                                  */
/* -------------------------------------------------------------------------- */

interface PersonSeed {
  fullName: string;
  email: string;
  phone: string;
  district: string;
  province: string;
  city: string;
}

const PEOPLE: readonly PersonSeed[] = [
  { fullName: 'Aayush Shrestha', email: 'aayush.shrestha@example.com', phone: '9801000001', district: 'Kathmandu', province: 'Bagmati', city: 'Kathmandu' },
  { fullName: 'Sujata Rai', email: 'sujata.rai@example.com', phone: '9801000002', district: 'Morang', province: 'Koshi', city: 'Biratnagar' },
  { fullName: 'Bibek Gurung', email: 'bibek.gurung@example.com', phone: '9801000003', district: 'Kaski', province: 'Gandaki', city: 'Pokhara' },
  { fullName: 'Nisha Tamang', email: 'nisha.tamang@example.com', phone: '9801000004', district: 'Lalitpur', province: 'Bagmati', city: 'Lalitpur' },
  { fullName: 'Rajan Thapa', email: 'rajan.thapa@example.com', phone: '9801000005', district: 'Chitwan', province: 'Bagmati', city: 'Bharatpur' },
  { fullName: 'Pratima Karki', email: 'pratima.karki@example.com', phone: '9801000006', district: 'Kathmandu', province: 'Bagmati', city: 'Kathmandu' },
  { fullName: 'Deepak Adhikari', email: 'deepak.adhikari@example.com', phone: '9801000007', district: 'Rupandehi', province: 'Lumbini', city: 'Butwal' },
  { fullName: 'Sabina Magar', email: 'sabina.magar@example.com', phone: '9801000008', district: 'Sunsari', province: 'Koshi', city: 'Dharan' },
  { fullName: 'Kiran Basnet', email: 'kiran.basnet@example.com', phone: '9801000009', district: 'Bhaktapur', province: 'Bagmati', city: 'Bhaktapur' },
  { fullName: 'Anita Poudel', email: 'anita.poudel@example.com', phone: '9801000010', district: 'Kailali', province: 'Sudurpashchim', city: 'Dhangadhi' },
  { fullName: 'Manish Lama', email: 'manish.lama@example.com', phone: '9801000011', district: 'Kathmandu', province: 'Bagmati', city: 'Kathmandu' },
  { fullName: 'Rekha Bhattarai', email: 'rekha.bhattarai@example.com', phone: '9801000012', district: 'Banke', province: 'Lumbini', city: 'Nepalgunj' },
  { fullName: 'Suman Maharjan', email: 'suman.maharjan@example.com', phone: '9801000013', district: 'Lalitpur', province: 'Bagmati', city: 'Lalitpur' },
  { fullName: 'Puja Chaudhary', email: 'puja.chaudhary@example.com', phone: '9801000014', district: 'Dhanusha', province: 'Madhesh', city: 'Janakpur' },
  { fullName: 'Nabin Khadka', email: 'nabin.khadka@example.com', phone: '9801000015', district: 'Surkhet', province: 'Karnali', city: 'Birendranagar' },
  { fullName: 'Sarita Joshi', email: 'sarita.joshi@example.com', phone: '9801000016', district: 'Kaski', province: 'Gandaki', city: 'Pokhara' },
  { fullName: 'Prakash Shahi', email: 'prakash.shahi@example.com', phone: '9801000017', district: 'Kathmandu', province: 'Bagmati', city: 'Kathmandu' },
  { fullName: 'Muna Limbu', email: 'muna.limbu@example.com', phone: '9801000018', district: 'Ilam', province: 'Koshi', city: 'Ilam' },
  { fullName: 'Santosh Yadav', email: 'santosh.yadav@example.com', phone: '9801000019', district: 'Parsa', province: 'Madhesh', city: 'Birgunj' },
  { fullName: 'Kamala Neupane', email: 'kamala.neupane@example.com', phone: '9801000020', district: 'Palpa', province: 'Lumbini', city: 'Tansen' },
  { fullName: 'Ramesh Bista', email: 'ramesh.bista@example.com', phone: '9801000021', district: 'Kathmandu', province: 'Bagmati', city: 'Kathmandu' },
  { fullName: 'Sneha Dahal', email: 'sneha.dahal@example.com', phone: '9801000022', district: 'Jhapa', province: 'Koshi', city: 'Damak' },
  { fullName: 'Bijay Sharma', email: 'bijay.sharma@example.com', phone: '9801000023', district: 'Makwanpur', province: 'Bagmati', city: 'Hetauda' },
  { fullName: 'Laxmi Pandey', email: 'laxmi.pandey@example.com', phone: '9801000024', district: 'Dang', province: 'Lumbini', city: 'Ghorahi' },
  { fullName: 'Arjun Koirala', email: 'arjun.koirala@example.com', phone: '9801000025', district: 'Kathmandu', province: 'Bagmati', city: 'Kathmandu' },
];

/** Where traffic comes from, weighted the way a small Nepali store's does. */
const REFERRERS: ReadonlyArray<{ url: string | null; weight: number }> = [
  { url: null, weight: 34 },
  { url: 'https://www.google.com/', weight: 26 },
  { url: 'https://www.facebook.com/', weight: 18 },
  { url: 'https://www.instagram.com/', weight: 9 },
  { url: 'https://www.tiktok.com/', weight: 6 },
  { url: 'https://www.youtube.com/', weight: 3 },
  { url: 'https://duckduckgo.com/', weight: 2 },
  { url: 'https://www.reddit.com/', weight: 2 },
];

const CONTACT_SUBJECTS: readonly string[] = [
  'Where is my order?',
  'Wrong size delivered',
  'Do you ship to Jumla?',
  'Bulk order enquiry',
  'Warranty claim for a headphone',
  'Cash on delivery limit',
  'Return policy question',
  'Invoice needs my PAN number',
];

const CANCEL_REASONS: readonly string[] = [
  'Customer changed their mind',
  'Item out of stock at the warehouse',
  'Could not reach the customer by phone',
  'Duplicate order',
];

/* -------------------------------------------------------------------------- */

export interface CommerceSeedResult {
  admins: number;
  customers: number;
  orders: number;
  pageViews: number;
  coupons: number;
  contacts: number;
  reviews: number;
}

export async function seedCommerce(prisma: PrismaClient): Promise<CommerceSeedResult> {
  const admins = await seedStaff(prisma);
  const customers = await seedCustomers(prisma);
  const coupons = await seedCoupons(prisma);
  const orders = await seedOrders(prisma);
  const pageViews = await seedPageViews(prisma);
  const contacts = await seedContacts(prisma);
  // After orders, so a review can be marked as a verified purchase.
  const reviews = await seedReviews(prisma);

  return { admins, customers, orders, pageViews, coupons, contacts, reviews };
}

/**
 * The two staff accounts.
 *
 * The password is fixed and printed by the seed. That is a deliberate
 * development-only affordance - `SEED_MINIMAL=1` skips this entire file, so a
 * production-shaped seed never creates them, and the credentials are useless
 * against any database this was not run on.
 */
export const DEMO_ADMIN_PASSWORD = 'Admin123!';

async function seedStaff(prisma: PrismaClient): Promise<number> {
  const passwordHash = await argon2.hash(DEMO_ADMIN_PASSWORD, ARGON2_OPTIONS);

  const staff = [
    { email: 'admin@bazaar.com.np', fullName: 'Bazaar Admin', role: UserRole.SUPER_ADMIN, phone: '9800000001' },
    { email: 'ops@bazaar.com.np', fullName: 'Operations Desk', role: UserRole.ADMIN, phone: '9800000002' },
  ];

  for (const person of staff) {
    await prisma.user.upsert({
      where: { email: person.email },
      update: { role: person.role },
      create: {
        email: person.email,
        fullName: person.fullName,
        phone: person.phone,
        passwordHash,
        role: person.role,
        emailVerified: true,
        phoneVerified: true,
        lastLoginAt: daysAgo(0, 9),
      },
    });
  }

  console.warn(`  staff      ${staff.length} accounts (password: ${DEMO_ADMIN_PASSWORD})`);
  return staff.length;
}

async function seedCustomers(prisma: PrismaClient): Promise<number> {
  const passwordHash = await argon2.hash('Customer123!', ARGON2_OPTIONS);
  let created = 0;

  for (const [index, person] of PEOPLE.entries()) {
    const existing = await prisma.user.findUnique({ where: { email: person.email } });
    if (existing) continue;

    // Spread signups across the whole window so "new customers this month" is
    // a real subset rather than everybody at once.
    const joinedDaysAgo = between(1, HISTORY_DAYS + 240);

    await prisma.user.create({
      data: {
        email: person.email,
        fullName: person.fullName,
        phone: person.phone,
        passwordHash,
        role: UserRole.CUSTOMER,
        emailVerified: true,
        phoneVerified: chance(0.7),
        createdAt: daysAgo(joinedDaysAgo, between(8, 22)),
        lastLoginAt: daysAgo(between(0, 30), between(8, 22)),
        addresses: {
          create: {
            label: index % 4 === 0 ? 'Office' : 'Home',
            fullName: person.fullName,
            phone: person.phone,
            street: `${between(1, 240)} ${pick(['Naya Sadak', 'Ring Road', 'Lakeside', 'Main Bazaar', 'Station Road'])}`,
            city: person.city,
            district: person.district,
            province: person.province,
            postalCode: String(between(10_000, 56_999)),
            isDefault: true,
          },
        },
      },
    });

    created += 1;
  }

  console.warn(`  customers  ${created} with addresses`);
  return created;
}

async function seedCoupons(prisma: PrismaClient): Promise<number> {
  const definitions = [
    {
      code: 'WELCOME10',
      type: CouponType.PERCENTAGE,
      value: 10,
      minOrderAmount: 2000,
      maxDiscountAmount: 1500,
      usageLimit: 500,
      perUserLimit: 1,
      validFrom: daysAgo(HISTORY_DAYS),
      validUntil: daysAgo(-180),
    },
    {
      code: 'DASHAIN500',
      type: CouponType.FIXED,
      value: 500,
      minOrderAmount: 5000,
      maxDiscountAmount: null,
      usageLimit: 200,
      perUserLimit: 2,
      validFrom: daysAgo(60),
      validUntil: daysAgo(-45),
    },
    {
      code: 'FREESHIP',
      type: CouponType.FREE_SHIPPING,
      value: 0,
      minOrderAmount: 1500,
      maxDiscountAmount: null,
      usageLimit: null,
      perUserLimit: null,
      validFrom: daysAgo(HISTORY_DAYS),
      validUntil: daysAgo(-365),
    },
    // Deliberately expired, so the coupons table has an EXPIRED row to badge.
    {
      code: 'TIHAR2024',
      type: CouponType.PERCENTAGE,
      value: 15,
      minOrderAmount: 3000,
      maxDiscountAmount: 3000,
      usageLimit: 300,
      perUserLimit: 1,
      validFrom: daysAgo(HISTORY_DAYS),
      validUntil: daysAgo(45),
    },
    // ...and one that has not started yet.
    {
      code: 'NEWYEAR20',
      type: CouponType.PERCENTAGE,
      value: 20,
      minOrderAmount: 4000,
      maxDiscountAmount: 4000,
      usageLimit: 1000,
      perUserLimit: 1,
      validFrom: daysAgo(-14),
      validUntil: daysAgo(-60),
    },
  ];

  for (const definition of definitions) {
    await prisma.coupon.upsert({
      where: { code: definition.code },
      update: {},
      create: { ...definition, isActive: true },
    });
  }

  console.warn(`  coupons    ${definitions.length}`);
  return definitions.length;
}

/**
 * Orders, weighted so the dashboard shows a plausible funnel rather than a
 * uniform distribution: most orders end DELIVERED, a few are still moving, and
 * a small tail is cancelled or refunded.
 *
 * Volume rises gently towards the present so the 30-day chart has a shape. The
 * status a given order lands on depends on how old it is - an order placed
 * yesterday cannot already be delivered, and one from three months ago should
 * not still be PENDING.
 */
async function seedOrders(prisma: PrismaClient): Promise<number> {
  const existing = await prisma.order.count();
  if (existing > 0) {
    console.warn(`  orders     ${existing} already present, skipping`);
    return existing;
  }

  const [customers, variants] = await Promise.all([
    prisma.user.findMany({
      where: { role: UserRole.CUSTOMER },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        addresses: { take: 1 },
      },
    }),
    prisma.productVariant.findMany({
      where: { isActive: true },
      select: {
        id: true,
        sku: true,
        name: true,
        priceOverride: true,
        product: { select: { id: true, name: true, slug: true, basePrice: true, categoryId: true } },
      },
    }),
  ]);

  if (customers.length === 0 || variants.length === 0) {
    console.warn('  orders     skipped (no customers or no products to order)');
    return 0;
  }

  let created = 0;
  let sequence = 0;

  for (let day = HISTORY_DAYS; day >= 0; day -= 1) {
    // 0 to 4 orders a day, trending up towards today.
    const pressure = 1 - day / HISTORY_DAYS;
    const count = between(0, Math.round(1 + pressure * 3));

    for (let n = 0; n < count; n += 1) {
      const placedAt = daysAgo(day, between(9, 21));
      const customer = pick(customers);
      const address = customer.addresses[0];
      if (!address) continue;

      const lines = Array.from({ length: between(1, 3) }, () => {
        const variant = pick(variants);
        const unitPrice = Number(variant.priceOverride ?? variant.product.basePrice);
        const quantity = between(1, 3);

        return {
          variant,
          quantity,
          unitPrice,
          totalPrice: unitPrice * quantity,
        };
      });

      const subtotal = lines.reduce((sum, line) => sum + line.totalPrice, 0);
      const discountAmount = chance(0.22) ? Math.round(subtotal * 0.1) : 0;
      const shippingCost = subtotal - discountAmount >= 5000 ? 0 : address.district === 'Kathmandu' ? 100 : 200;
      const taxAmount = Math.round((subtotal - discountAmount) * 0.13);
      const total = subtotal - discountAmount + shippingCost + taxAmount;

      const status = statusForAge(day);
      const method = pick([
        PaymentMethod.COD,
        PaymentMethod.COD,
        PaymentMethod.ESEWA,
        PaymentMethod.KHALTI,
        PaymentMethod.FONEPAY,
        PaymentMethod.STRIPE,
      ]);

      sequence += 1;
      const stamp = placedAt.toISOString().slice(0, 10).replace(/-/g, '');
      const orderNumber = `ORD-${stamp}-${String(sequence).padStart(4, '0')}`;

      const paid = status !== OrderStatus.PENDING && status !== OrderStatus.CANCELLED;

      const order = await prisma.order.create({
        data: {
          orderNumber,
          userId: customer.id,
          status,
          subtotal,
          discountAmount,
          shippingCost,
          taxAmount,
          total,
          currency: 'NPR',
          shippingAddress: {
            fullName: address.fullName,
            phone: address.phone,
            street: address.street,
            city: address.city,
            district: address.district,
            province: address.province,
            postalCode: address.postalCode,
            country: 'Nepal',
          },
          notes: chance(0.15) ? 'Please call before delivery.' : null,
          cancelledReason: status === OrderStatus.CANCELLED ? pick(CANCEL_REASONS) : null,
          trackingNumber:
            status === OrderStatus.SHIPPED || status === OrderStatus.DELIVERED
              ? `NCM${between(100_000, 999_999)}`
              : null,
          carrier:
            status === OrderStatus.SHIPPED || status === OrderStatus.DELIVERED
              ? pick(['NCM', 'PATHAO', 'ARAMEX'])
              : null,
          createdAt: placedAt,
          placedAt: status === OrderStatus.PENDING ? null : placedAt,
          deliveredAt:
            status === OrderStatus.DELIVERED
              ? new Date(placedAt.getTime() + between(1, 5) * DAY_MS)
              : null,
          items: {
            create: lines.map((line) => ({
              productId: line.variant.product.id,
              variantId: line.variant.id,
              productName: line.variant.product.name,
              variantName: line.variant.name,
              sku: line.variant.sku,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              totalPrice: line.totalPrice,
              productSnapshot: {
                name: line.variant.product.name,
                slug: line.variant.product.slug,
                basePrice: Number(line.variant.product.basePrice),
              },
              createdAt: placedAt,
            })),
          },
          payments: {
            create: {
              method,
              status: paid ? PaymentStatus.COMPLETED : PaymentStatus.PENDING,
              amount: total,
              currency: 'NPR',
              transactionId: paid ? `TXN${between(10_000_000, 99_999_999)}` : null,
              paidAt: paid ? placedAt : null,
              createdAt: placedAt,
            },
          },
          statusHistory: {
            create: { status, note: 'Seeded history', createdAt: placedAt },
          },
        },
        select: { id: true, payments: { select: { id: true } } },
      });

      // A refunded order needs the refund row behind it, or the analytics
      // refund line stays at zero while the status column says otherwise.
      if (status === OrderStatus.REFUNDED) {
        const payment = order.payments[0];
        if (payment) {
          await prisma.refund.create({
            data: {
              paymentId: payment.id,
              amount: total,
              reason: 'Customer returned the item',
              status: RefundStatus.COMPLETED,
              processedAt: new Date(placedAt.getTime() + 3 * DAY_MS),
              createdAt: new Date(placedAt.getTime() + 3 * DAY_MS),
            },
          });
        }
      }

      created += 1;
    }
  }

  console.warn(`  orders     ${created} across ${HISTORY_DAYS} days`);
  return created;
}

/**
 * How old an order is decides where it can plausibly have got to. Anything
 * older than a fortnight has finished moving; the last few days hold the
 * work-in-progress an operator would actually see in their queue.
 */
function statusForAge(daysOld: number): OrderStatus {
  if (daysOld <= 1) {
    return pick([OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.CONFIRMED, OrderStatus.PROCESSING]);
  }
  if (daysOld <= 4) {
    return pick([OrderStatus.CONFIRMED, OrderStatus.PROCESSING, OrderStatus.PROCESSING, OrderStatus.SHIPPED]);
  }
  if (daysOld <= 10) {
    return pick([OrderStatus.PROCESSING, OrderStatus.SHIPPED, OrderStatus.SHIPPED, OrderStatus.DELIVERED, OrderStatus.CANCELLED]);
  }

  return pick([
    OrderStatus.DELIVERED,
    OrderStatus.DELIVERED,
    OrderStatus.DELIVERED,
    OrderStatus.DELIVERED,
    OrderStatus.DELIVERED,
    OrderStatus.DELIVERED,
    OrderStatus.CANCELLED,
    OrderStatus.REFUNDED,
  ]);
}

/**
 * Traffic, so the analytics page has visitors to divide orders by.
 *
 * Product pages get most of it and are weighted towards the products that
 * actually sold, which is what makes the per-product conversion column read as
 * a real number instead of noise.
 */
async function seedPageViews(prisma: PrismaClient): Promise<number> {
  const existing = await prisma.pageView.count();
  if (existing > 0) {
    console.warn(`  pageviews  ${existing} already present, skipping`);
    return existing;
  }

  const [products, customers] = await Promise.all([
    prisma.product.findMany({ where: { isActive: true }, select: { slug: true } }),
    prisma.user.findMany({ where: { role: UserRole.CUSTOMER }, select: { id: true } }),
  ]);

  if (products.length === 0) return 0;

  const staticPaths = ['/', '/products', '/products?sort=newest', '/cart', '/checkout'];
  const rows: Array<{
    sessionId: string;
    userId: string | null;
    pagePath: string;
    referrer: string | null;
    country: string;
    createdAt: Date;
  }> = [];

  for (let day = HISTORY_DAYS; day >= 0; day -= 1) {
    const pressure = 1 - day / HISTORY_DAYS;
    const sessions = between(6, Math.round(10 + pressure * 26));

    for (let s = 0; s < sessions; s += 1) {
      const sessionId = `seed-${day}-${s}-${between(1000, 9999)}`;
      const referrer = weightedReferrer();
      const signedIn = chance(0.35) && customers.length > 0;
      const userId = signedIn ? pick(customers).id : null;
      const pages = between(1, 6);

      for (let p = 0; p < pages; p += 1) {
        const path =
          p === 0 || chance(0.35)
            ? pick(staticPaths)
            : `/products/${pick(products).slug}`;

        rows.push({
          sessionId,
          userId,
          pagePath: path,
          // Only the landing hit carries the external referrer; the rest of the
          // session is internal navigation, which is what a real beacon sends.
          referrer: p === 0 ? referrer : null,
          country: 'NP',
          createdAt: daysAgo(day, between(7, 23)),
        });
      }
    }
  }

  // Chunked: a single createMany of ~30,000 rows exceeds the parameter limit
  // Postgres will accept in one statement.
  for (let index = 0; index < rows.length; index += 1000) {
    await prisma.pageView.createMany({ data: rows.slice(index, index + 1000) });
  }

  console.warn(`  pageviews  ${rows.length}`);
  return rows.length;
}

function weightedReferrer(): string | null {
  const total = REFERRERS.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = random() * total;

  for (const entry of REFERRERS) {
    roll -= entry.weight;
    if (roll <= 0) return entry.url;
  }

  return null;
}

async function seedContacts(prisma: PrismaClient): Promise<number> {
  const existing = await prisma.contactMessage.count();
  if (existing > 0) {
    console.warn(`  contacts   ${existing} already present, skipping`);
    return existing;
  }

  const rows = Array.from({ length: 14 }, () => {
    const person = pick(PEOPLE);
    const day = between(0, 45);
    // Older messages have been dealt with; recent ones are the queue.
    const status = day <= 3 ? ContactStatus.NEW : day <= 12 ? ContactStatus.READ : ContactStatus.REPLIED;

    return {
      name: person.fullName,
      email: person.email,
      phone: person.phone,
      subject: pick(CONTACT_SUBJECTS),
      message:
        'Hello, I placed an order last week and wanted to check on it. Could you let me know where it has reached? Thank you.',
      status,
      repliedAt: status === ContactStatus.REPLIED ? daysAgo(day - 1, 11) : null,
      createdAt: daysAgo(day, between(9, 20)),
    };
  });

  await prisma.contactMessage.createMany({ data: rows });

  console.warn(`  contacts   ${rows.length}`);
  return rows.length;
}

/* -------------------------------------------------------------------------- */
/*  Reviews                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Review bodies, grouped by rating.
 *
 * Written to carry *recurring* themes rather than noise - quality and delivery
 * speed on the praise side, sizing and packaging on the complaint side - because
 * the thing that reads them next is the AI summariser (E4), and a summary is
 * only checkable if the consensus it reports is actually there in the list
 * underneath it.
 */
const REVIEW_BODIES: Readonly<Record<number, readonly string[]>> = {
  5: [
    'Excellent quality for the price. Arrived in Kathmandu in two days, well packed.',
    'Exactly as described. Build quality is genuinely good and delivery was fast.',
    'Very happy with this. Feels solid, and the courier reached Pokhara quicker than I expected.',
    'Great quality and the seller responded to my question within the hour. Would buy again.',
    'Worth every rupee. Fast delivery and no damage in transit.',
    'Superb finish. My second order from Bazaar and both arrived early.',
  ],
  4: [
    'Good quality overall. Delivery was quick, though the box was a little dented.',
    'Does the job well. Runs slightly small, so consider ordering a size up.',
    'Happy with it. Only complaint is the packaging - could use more padding.',
    'Solid product for the price. Took three days to reach Biratnagar, which is fair.',
    'Nice quality material. The colour is a shade darker than the photos.',
  ],
  3: [
    'Decent, but it runs small. I had to exchange for a larger size.',
    'Average. Quality is fine, but the packaging arrived crushed on one corner.',
    'It works, though the finish is not quite what the photos suggested.',
  ],
  2: [
    'Quality is fine but it runs small and the return process took a while.',
    'Arrived with the packaging torn. The product itself was undamaged, thankfully.',
  ],
};

const REVIEW_TITLES: Readonly<Record<number, readonly string[]>> = {
  5: ['Excellent', 'Exactly what I wanted', 'Fast delivery, great quality'],
  4: ['Good, with one small caveat', 'Happy overall', 'Solid buy'],
  3: ['Mixed feelings', 'Fine, but check the size'],
  2: ['Not quite right', 'Packaging let it down'],
};

/**
 * Deterministic ratings skewed the way a real store's are: mostly four and
 * five stars, with enough threes and twos that "MIXED" is a sentiment the
 * summariser can legitimately reach.
 */
const RATING_WEIGHTS: ReadonlyArray<{ rating: number; weight: number }> = [
  { rating: 5, weight: 52 },
  { rating: 4, weight: 28 },
  { rating: 3, weight: 13 },
  { rating: 2, weight: 7 },
];

function weightedRating(): number {
  const total = RATING_WEIGHTS.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = random() * total;

  for (const entry of RATING_WEIGHTS) {
    roll -= entry.weight;
    if (roll <= 0) return entry.rating;
  }

  return 5;
}

/**
 * Reviews for the catalogue.
 *
 * The first few products get well past the ten-review threshold on purpose:
 * that is the line at which the AI summary card appears (E4), and a demo store
 * where nothing crosses it would hide the feature entirely. `isVerifiedPurchase`
 * is not decorative - it is set only when that customer really does have an
 * order line for that product, so the badge means what it says.
 */
async function seedReviews(prisma: PrismaClient): Promise<number> {
  const existing = await prisma.review.count();
  if (existing > 0) {
    console.warn(`  reviews    ${existing} already present, skipping`);
    return existing;
  }

  const [customers, products, purchases] = await Promise.all([
    prisma.user.findMany({
      where: { role: UserRole.CUSTOMER },
      select: { id: true },
      orderBy: { email: 'asc' },
    }),
    prisma.product.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true },
      orderBy: { sku: 'asc' },
    }),
    prisma.orderItem.findMany({
      where: { productId: { not: null } },
      select: { productId: true, order: { select: { userId: true } } },
    }),
  ]);

  if (customers.length === 0 || products.length === 0) {
    console.warn('  reviews    0 (no customers or products to review)');
    return 0;
  }

  const bought = new Set(
    purchases
      .filter((line) => line.productId && line.order.userId)
      .map((line) => `${line.productId}:${line.order.userId}`),
  );

  const rows: Array<{
    productId: string;
    userId: string;
    rating: number;
    title: string;
    body: string;
    isVerifiedPurchase: boolean;
    isApproved: boolean;
    helpfulCount: number;
    createdAt: Date;
  }> = [];

  for (const [index, product] of products.entries()) {
    // Four products carry a full review history; the rest taper off, the way a
    // catalogue actually looks.
    const count =
      index < 4
        ? between(14, 18)
        : index < 10
          ? between(4, 9)
          : between(0, 3);

    // One review per customer per product (the unique constraint), so the
    // reviewer list is a rotating window over the customer list.
    const reviewers = customers
      .slice(index % customers.length)
      .concat(customers.slice(0, index % customers.length))
      .slice(0, Math.min(count, customers.length));

    for (const [position, reviewer] of reviewers.entries()) {
      const rating = weightedRating();
      const daysOld = between(1, HISTORY_DAYS);

      rows.push({
        productId: product.id,
        userId: reviewer.id,
        rating,
        title: pick(REVIEW_TITLES[rating] ?? REVIEW_TITLES[5]!),
        body: pick(REVIEW_BODIES[rating] ?? REVIEW_BODIES[5]!),
        isVerifiedPurchase: bought.has(`${product.id}:${reviewer.id}`),
        // A handful sit unapproved so the moderation queue in Phase 7 has
        // something to open, and so "approved only" is a filter with teeth.
        isApproved: position === 0 ? true : chance(0.92),
        helpfulCount: between(0, 24),
        createdAt: daysAgo(daysOld, between(9, 21)),
      });
    }
  }

  await prisma.review.createMany({ data: rows, skipDuplicates: true });

  console.warn(`  reviews    ${rows.length}`);
  return rows.length;
}
