/**
 * Database seed.
 *
 * Store settings are always written. The demo catalog - 10 categories three
 * levels deep and 50 products with variants - is written unless SEED_MINIMAL=1,
 * so a production-shaped deploy can seed configuration without fixtures.
 *
 *   pnpm db:seed                 settings + demo catalog
 *   SEED_MINIMAL=1 pnpm db:seed  settings only
 *
 * Re-running is safe: everything upserts on a natural key.
 */
import { PrismaClient, ProductStatus } from '@prisma/client';

const prisma = new PrismaClient();

/* -------------------------------------------------------------------------- */
/*  Store settings                                                            */
/* -------------------------------------------------------------------------- */

const STORE_DEFAULTS: Array<{ key: string; value: unknown }> = [
  {
    key: 'store.general',
    value: {
      name: 'Bazaar',
      tagline: 'Everything you need, delivered across Nepal.',
      contactEmail: 'support@bazaar.com.np',
      contactPhone: '+977-1-4000000',
      logoUrl: null,
      faviconUrl: null,
    },
  },
  { key: 'store.currency', value: { default: 'NPR', supported: ['NPR', 'USD'] } },
  { key: 'store.tax', value: { rate: 0.13, label: 'VAT', inclusive: false } },
  {
    key: 'store.shipping',
    value: { freeShippingThreshold: 5000, defaultFlatRate: 150, zones: [] },
  },
  {
    key: 'store.payments',
    value: {
      enabled: ['COD'],
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
    },
  },
  {
    key: 'store.social',
    value: { facebook: null, instagram: null, tiktok: null, youtube: null },
  },
  { key: 'store.maintenance', value: { enabled: false, message: 'We will be back shortly.' } },
];

/* -------------------------------------------------------------------------- */
/*  Category tree - 3 levels                                                  */
/* -------------------------------------------------------------------------- */

interface CategorySeed {
  name: string;
  slug: string;
  description?: string;
  children?: CategorySeed[];
}

const CATEGORY_TREE: CategorySeed[] = [
  {
    name: 'Electronics',
    slug: 'electronics',
    description: 'Phones, laptops, audio and everything that plugs in.',
    children: [
      {
        name: 'Phones',
        slug: 'phones',
        children: [
          { name: 'Smartphones', slug: 'smartphones' },
          { name: 'Feature Phones', slug: 'feature-phones' },
        ],
      },
      {
        name: 'Computers',
        slug: 'computers',
        children: [
          { name: 'Laptops', slug: 'laptops' },
          { name: 'Accessories', slug: 'computer-accessories' },
        ],
      },
      { name: 'Audio', slug: 'audio' },
    ],
  },
  {
    name: 'Fashion',
    slug: 'fashion',
    description: 'Clothing and footwear for every season.',
    children: [
      {
        name: "Men's Clothing",
        slug: 'mens-clothing',
        children: [
          { name: 'T-Shirts', slug: 'mens-t-shirts' },
          { name: 'Jackets', slug: 'mens-jackets' },
        ],
      },
      {
        name: "Women's Clothing",
        slug: 'womens-clothing',
        children: [{ name: 'Kurtas', slug: 'womens-kurtas' }],
      },
      { name: 'Footwear', slug: 'footwear' },
    ],
  },
  {
    name: 'Home & Living',
    slug: 'home-living',
    description: 'Kitchen, decor and the things that make a house work.',
    children: [
      { name: 'Kitchen', slug: 'kitchen' },
      { name: 'Decor', slug: 'decor' },
    ],
  },
];

/* -------------------------------------------------------------------------- */
/*  Product fixtures                                                          */
/* -------------------------------------------------------------------------- */

interface ProductSeed {
  name: string;
  brand: string;
  categorySlug: string;
  price: number;
  tags: string[];
  options?: Record<string, string[]>;
}

const BRANDS_BY_AREA: Record<string, string[]> = {
  tech: ['Nova', 'Lumen', 'Kori', 'Axon', 'Sable'],
  fashion: ['Bazaar Basics', 'Himal Threads', 'Patan Co.', 'Terai Wear'],
  home: ['Hearth', 'Everest Home', 'Chitwan Craft'],
};

const PRODUCTS: ProductSeed[] = [
  // --- Smartphones (6) ---
  { name: 'Nova X7 Pro 5G', brand: 'Nova', categorySlug: 'smartphones', price: 74999, tags: ['5g', 'amoled', 'flagship'], options: { Storage: ['128GB', '256GB'], Colour: ['Midnight', 'Silver'] } },
  { name: 'Nova X5 Lite', brand: 'Nova', categorySlug: 'smartphones', price: 32999, tags: ['5g', 'budget'], options: { Storage: ['64GB', '128GB'] } },
  { name: 'Axon Pulse 12', brand: 'Axon', categorySlug: 'smartphones', price: 58999, tags: ['amoled', 'fast-charging'], options: { Colour: ['Graphite', 'Ocean', 'Sand'] } },
  { name: 'Kori Neo 4', brand: 'Kori', categorySlug: 'smartphones', price: 24999, tags: ['budget', 'long-battery'] },
  { name: 'Sable Edge S', brand: 'Sable', categorySlug: 'smartphones', price: 89999, tags: ['flagship', 'camera'], options: { Storage: ['256GB', '512GB'] } },
  { name: 'Lumen Air Mini', brand: 'Lumen', categorySlug: 'smartphones', price: 41999, tags: ['compact', '5g'] },
  // --- Feature phones (3) ---
  { name: 'Kori Classic K1', brand: 'Kori', categorySlug: 'feature-phones', price: 3499, tags: ['dual-sim', 'long-battery'] },
  { name: 'Kori Classic K3 Torch', brand: 'Kori', categorySlug: 'feature-phones', price: 4299, tags: ['torch', 'fm-radio'] },
  { name: 'Sable Talk Lite', brand: 'Sable', categorySlug: 'feature-phones', price: 2899, tags: ['budget'] },
  // --- Laptops (5) ---
  { name: 'Lumen Book 14', brand: 'Lumen', categorySlug: 'laptops', price: 119999, tags: ['ultrabook', 'oled'], options: { RAM: ['16GB', '32GB'], Storage: ['512GB', '1TB'] } },
  { name: 'Lumen Book Pro 16', brand: 'Lumen', categorySlug: 'laptops', price: 219999, tags: ['creator', 'oled'], options: { RAM: ['32GB', '64GB'] } },
  { name: 'Axon Work 15', brand: 'Axon', categorySlug: 'laptops', price: 84999, tags: ['office', 'value'] },
  { name: 'Nova Stream Gaming 15', brand: 'Nova', categorySlug: 'laptops', price: 164999, tags: ['gaming', '144hz'], options: { RAM: ['16GB', '32GB'] } },
  { name: 'Kori Chrome 11', brand: 'Kori', categorySlug: 'laptops', price: 34999, tags: ['student', 'lightweight'] },
  // --- Computer accessories (6) ---
  { name: 'Axon Mechanical Keyboard 87', brand: 'Axon', categorySlug: 'computer-accessories', price: 8999, tags: ['mechanical', 'rgb'], options: { Switch: ['Red', 'Brown', 'Blue'] } },
  { name: 'Nova Silent Mouse M2', brand: 'Nova', categorySlug: 'computer-accessories', price: 2499, tags: ['wireless', 'silent'], options: { Colour: ['Black', 'White'] } },
  { name: 'Lumen USB-C Hub 8-in-1', brand: 'Lumen', categorySlug: 'computer-accessories', price: 5499, tags: ['usb-c', 'hdmi'] },
  { name: 'Sable Laptop Stand Alloy', brand: 'Sable', categorySlug: 'computer-accessories', price: 3999, tags: ['aluminium', 'ergonomic'] },
  { name: 'Kori 27" QHD Monitor', brand: 'Kori', categorySlug: 'computer-accessories', price: 44999, tags: ['qhd', '75hz'] },
  { name: 'Axon Webcam 1080p', brand: 'Axon', categorySlug: 'computer-accessories', price: 4499, tags: ['1080p', 'streaming'] },
  // --- Audio (6) ---
  { name: 'Sable Studio Over-Ear ANC', brand: 'Sable', categorySlug: 'audio', price: 18999, tags: ['anc', 'over-ear'], options: { Colour: ['Black', 'Ivory'] } },
  { name: 'Nova Buds Air 3', brand: 'Nova', categorySlug: 'audio', price: 7999, tags: ['tws', 'anc'], options: { Colour: ['White', 'Navy'] } },
  { name: 'Lumen Soundbar 2.1', brand: 'Lumen', categorySlug: 'audio', price: 22999, tags: ['soundbar', 'subwoofer'] },
  { name: 'Kori Bass Boom Speaker', brand: 'Kori', categorySlug: 'audio', price: 5999, tags: ['bluetooth', 'waterproof'], options: { Colour: ['Black', 'Red', 'Teal'] } },
  { name: 'Axon Studio Microphone U1', brand: 'Axon', categorySlug: 'audio', price: 9499, tags: ['usb', 'podcast'] },
  { name: 'Nova Sport Buds', brand: 'Nova', categorySlug: 'audio', price: 4299, tags: ['sport', 'sweatproof'] },
  // --- Men's t-shirts (6) ---
  { name: 'Premium Cotton T-Shirt', brand: 'Bazaar Basics', categorySlug: 'mens-t-shirts', price: 1499, tags: ['cotton', 'casual'], options: { Size: ['S', 'M', 'L', 'XL'], Colour: ['Black', 'White', 'Olive'] } },
  { name: 'Everyday Pique Polo', brand: 'Bazaar Basics', categorySlug: 'mens-t-shirts', price: 1899, tags: ['polo', 'cotton'], options: { Size: ['M', 'L', 'XL'], Colour: ['Navy', 'Grey'] } },
  { name: 'Himal Graphic Tee', brand: 'Himal Threads', categorySlug: 'mens-t-shirts', price: 1299, tags: ['graphic', 'cotton'], options: { Size: ['S', 'M', 'L'] } },
  { name: 'Patan Linen Shirt', brand: 'Patan Co.', categorySlug: 'mens-t-shirts', price: 2799, tags: ['linen', 'summer'], options: { Size: ['M', 'L', 'XL'] } },
  { name: 'Terai Oversized Tee', brand: 'Terai Wear', categorySlug: 'mens-t-shirts', price: 1599, tags: ['oversized', 'streetwear'], options: { Size: ['M', 'L', 'XL'] } },
  { name: 'Bazaar Henley Long Sleeve', brand: 'Bazaar Basics', categorySlug: 'mens-t-shirts', price: 2199, tags: ['henley', 'long-sleeve'], options: { Size: ['S', 'M', 'L'] } },
  // --- Men's jackets (4) ---
  { name: 'Himal Puffer Jacket', brand: 'Himal Threads', categorySlug: 'mens-jackets', price: 8999, tags: ['winter', 'puffer'], options: { Size: ['M', 'L', 'XL'], Colour: ['Black', 'Forest'] } },
  { name: 'Patan Denim Jacket', brand: 'Patan Co.', categorySlug: 'mens-jackets', price: 5499, tags: ['denim', 'casual'], options: { Size: ['M', 'L'] } },
  { name: 'Terai Windbreaker', brand: 'Terai Wear', categorySlug: 'mens-jackets', price: 4299, tags: ['windproof', 'lightweight'], options: { Size: ['S', 'M', 'L', 'XL'] } },
  { name: 'Himal Fleece Zip-Up', brand: 'Himal Threads', categorySlug: 'mens-jackets', price: 3799, tags: ['fleece', 'winter'], options: { Size: ['M', 'L'] } },
  // --- Women's kurtas (5) ---
  { name: 'Block-Print Cotton Kurta', brand: 'Patan Co.', categorySlug: 'womens-kurtas', price: 2499, tags: ['cotton', 'handblock'], options: { Size: ['S', 'M', 'L'], Colour: ['Indigo', 'Rust'] } },
  { name: 'Embroidered Festive Kurta', brand: 'Himal Threads', categorySlug: 'womens-kurtas', price: 4599, tags: ['festive', 'embroidered'], options: { Size: ['S', 'M', 'L', 'XL'] } },
  { name: 'Everyday Straight Kurta', brand: 'Bazaar Basics', categorySlug: 'womens-kurtas', price: 1799, tags: ['cotton', 'daily'], options: { Size: ['M', 'L'] } },
  { name: 'Terai Chikankari Kurta', brand: 'Terai Wear', categorySlug: 'womens-kurtas', price: 3299, tags: ['chikankari', 'summer'], options: { Size: ['S', 'M', 'L'] } },
  { name: 'Patan Silk Blend Kurta', brand: 'Patan Co.', categorySlug: 'womens-kurtas', price: 5899, tags: ['silk', 'occasion'], options: { Size: ['M', 'L'] } },
  // --- Footwear (4) ---
  { name: 'Himal Trail Runner', brand: 'Himal Threads', categorySlug: 'footwear', price: 6499, tags: ['running', 'trail'], options: { Size: ['40', '41', '42', '43'] } },
  { name: 'Patan Leather Loafer', brand: 'Patan Co.', categorySlug: 'footwear', price: 7999, tags: ['leather', 'formal'], options: { Size: ['40', '41', '42'] } },
  { name: 'Terai Canvas Sneaker', brand: 'Terai Wear', categorySlug: 'footwear', price: 3499, tags: ['canvas', 'casual'], options: { Size: ['39', '40', '41', '42'], Colour: ['White', 'Black'] } },
  { name: 'Bazaar Everyday Sandal', brand: 'Bazaar Basics', categorySlug: 'footwear', price: 1999, tags: ['sandal', 'monsoon'], options: { Size: ['40', '41', '42'] } },
  // --- Kitchen (3) ---
  { name: 'Hearth Cast Iron Skillet 26cm', brand: 'Hearth', categorySlug: 'kitchen', price: 4999, tags: ['cast-iron', 'cookware'] },
  { name: 'Everest Pressure Cooker 5L', brand: 'Everest Home', categorySlug: 'kitchen', price: 3899, tags: ['cooker', 'stainless'] },
  { name: 'Hearth Knife Block Set', brand: 'Hearth', categorySlug: 'kitchen', price: 7499, tags: ['knives', 'set'] },
  // --- Decor (2) ---
  { name: 'Chitwan Handwoven Throw', brand: 'Chitwan Craft', categorySlug: 'decor', price: 3299, tags: ['handwoven', 'wool'], options: { Colour: ['Natural', 'Charcoal'] } },
  { name: 'Everest Ceramic Vase', brand: 'Everest Home', categorySlug: 'decor', price: 2299, tags: ['ceramic', 'handmade'] },
];

/* -------------------------------------------------------------------------- */
/*  Deterministic pseudo-randomness                                           */
/* -------------------------------------------------------------------------- */

/**
 * A seeded PRNG so re-seeding produces the same catalog. Randomised stock and
 * discounts that shuffle on every run make screenshots and tests useless.
 */
function makeRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return state / 4_294_967_296;
  };
}

const random = makeRandom(20_270_815);

function pick<T>(values: readonly T[]): T {
  const value = values[Math.floor(random() * values.length)];
  if (value === undefined) throw new Error('pick() called with an empty list');
  return value;
}

function between(min: number, max: number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

/** Cartesian product of the option sets, e.g. Size x Colour. */
function combine(options: Record<string, string[]>): Array<Record<string, string>> {
  return Object.keys(options).reduce<Array<Record<string, string>>>(
    (acc, key) =>
      acc.flatMap((partial) => (options[key] ?? []).map((value) => ({ ...partial, [key]: value }))),
    [{}],
  );
}

/* -------------------------------------------------------------------------- */

async function seedSettings(): Promise<void> {
  for (const setting of STORE_DEFAULTS) {
    await prisma.storeSetting.upsert({
      where: { key: setting.key },
      update: {},
      create: { key: setting.key, value: setting.value as never },
    });
  }
  console.warn(`  settings   ${STORE_DEFAULTS.length} keys`);
}

async function seedCategories(): Promise<number> {
  let count = 0;

  const walk = async (nodes: CategorySeed[], parentId: string | null, depth: number) => {
    for (const [index, node] of nodes.entries()) {
      const category = await prisma.category.upsert({
        where: { slug: node.slug },
        update: { name: node.name, parentId, sortOrder: index },
        create: {
          name: node.name,
          slug: node.slug,
          description: node.description ?? null,
          parentId,
          sortOrder: index,
          isActive: true,
          metaTitle: `${node.name} | Bazaar`,
          metaDescription: node.description ?? `Shop ${node.name} at Bazaar.`,
          imageUrl: `https://picsum.photos/seed/${node.slug}/600/400`,
        },
      });

      count += 1;
      if (node.children) await walk(node.children, category.id, depth + 1);
    }
  };

  await walk(CATEGORY_TREE, null, 0);
  console.warn(`  categories ${count} across 3 levels`);
  return count;
}

async function seedProducts(): Promise<number> {
  const categories = await prisma.category.findMany({ select: { id: true, slug: true } });
  const categoryBySlug = new Map(categories.map((c) => [c.slug, c.id]));

  let created = 0;

  for (const [index, seed] of PRODUCTS.entries()) {
    const categoryId = categoryBySlug.get(seed.categorySlug);
    if (!categoryId) {
      console.warn(`  ! skipping ${seed.name}: no category "${seed.categorySlug}"`);
      continue;
    }

    const slug = slugify(seed.name);
    const sku = `BZR-${String(index + 1).padStart(4, '0')}`;

    // Roughly one in three is on sale, at 10-30% off.
    const onSale = random() < 0.35;
    const compareAtPrice = onSale
      ? Math.round((seed.price / (1 - between(10, 30) / 100)) / 10) * 10
      : null;

    const existing = await prisma.product.findUnique({ where: { sku } });
    if (existing) continue;

    const combinations = seed.options ? combine(seed.options) : [{}];

    await prisma.product.create({
      data: {
        sku,
        name: seed.name,
        slug,
        shortDescription: `${seed.brand} ${seed.name} - ${seed.tags.slice(0, 2).join(', ')}.`,
        description: buildDescription(seed),
        basePrice: seed.price,
        compareAtPrice,
        costPrice: Math.round(seed.price * 0.62),
        currency: 'NPR',
        categoryId,
        brand: seed.brand,
        tags: seed.tags,
        attributes: {
          ...(seed.options ?? {}),
          warranty: seed.categorySlug.includes('phone') ? '12 months' : '6 months',
        },
        status: ProductStatus.ACTIVE,
        isActive: true,
        isFeatured: random() < 0.2,
        weight: Number((random() * 2 + 0.1).toFixed(2)),
        metaTitle: `${seed.name} | Bazaar`,
        metaDescription: `Buy ${seed.name} by ${seed.brand} at Bazaar. Free delivery over Rs 5,000.`,
        viewCount: between(0, 4000),
        images: {
          create: [0, 1, 2].map((n) => ({
            url: `https://picsum.photos/seed/${slug}-${n}/900/900`,
            altText: `${seed.name} - view ${n + 1}`,
            sortOrder: n,
            isPrimary: n === 0,
            width: 900,
            height: 900,
          })),
        },
        variants: {
          create: combinations.map((attributes) => {
            const label = Object.values(attributes).join(' / ') || 'Default';
            const suffix =
              Object.values(attributes)
                .map((value) => value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
                .join('-') || 'DEFAULT';

            return {
              sku: `${sku}-${suffix}`,
              name: label,
              // Larger storage and sizes carry a small premium.
              priceOverride: premiumFor(attributes) ? seed.price + between(2, 12) * 500 : null,
              // One variant in eight is out of stock, so empty states are visible.
              stockQuantity: random() < 0.12 ? 0 : between(3, 140),
              attributes,
              isActive: true,
            };
          }),
        },
      },
    });

    created += 1;
  }

  console.warn(`  products   ${created} with variants and images`);
  return created;
}

function premiumFor(attributes: Record<string, string>): boolean {
  const storage = attributes.Storage ?? attributes.RAM;
  if (!storage) return false;
  return /256|512|1TB|32GB|64GB/.test(storage);
}

function buildDescription(seed: ProductSeed): string {
  return [
    `<p>${seed.name} from ${seed.brand}, built for everyday use and backed by our returns policy.</p>`,
    '<ul>',
    ...seed.tags.map((tag) => `<li>${tag.replace(/-/g, ' ')}</li>`),
    '<li>Delivered across all 77 districts</li>',
    '<li>Cash on delivery available</li>',
    '</ul>',
    '<p>Free delivery on orders over Rs 5,000 inside the Kathmandu valley.</p>',
  ].join('');
}

/* -------------------------------------------------------------------------- */

async function main(): Promise<void> {
  console.warn('Seeding Bazaar…');

  await seedSettings();

  if (process.env.SEED_MINIMAL === '1') {
    console.warn('  (SEED_MINIMAL=1 - skipping the demo catalog)');
    return;
  }

  await seedCategories();
  const products = await seedProducts();

  const [categoryCount, variantCount, imageCount] = await Promise.all([
    prisma.category.count(),
    prisma.productVariant.count(),
    prisma.productImage.count(),
  ]);

  console.warn(
    `\nDone. ${categoryCount} categories, ${products} products, ${variantCount} variants, ${imageCount} images.`,
  );
  console.warn('Run "curl -X POST localhost:4000/api/v1/admin/products/reindex" to index them.');
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
