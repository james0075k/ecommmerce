import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AdminSearchHit, AdminSearchInput, AdminSearchResults } from '@bazaar/shared';

import { PrismaService } from '../prisma/prisma.service';

/**
 * The top bar's search box.
 *
 * Postgres `ILIKE` across four tables rather than Meilisearch, deliberately.
 * The storefront's search is a ranking problem - the shopper does not know what
 * they want and relevance decides whether they buy. This is a lookup problem:
 * an operator has an order number on a sticky note, or half a customer's email,
 * and wants that exact record. Substring matching finds it, needs no index to
 * be in sync, and works when the search service is down - which is when an
 * operator most needs to look an order up.
 */
@Injectable()
export class AdminSearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(query: AdminSearchInput): Promise<AdminSearchResults> {
    const started = Date.now();
    const term = query.q;
    const contains = { contains: term, mode: Prisma.QueryMode.insensitive };

    const [orders, products, customers, coupons] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          OR: [
            { orderNumber: contains },
            { guestEmail: contains },
            { trackingNumber: contains },
            { user: { OR: [{ email: contains }, { fullName: contains }] } },
          ],
        },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          total: true,
          user: { select: { fullName: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: query.limit,
      }),
      this.prisma.product.findMany({
        where: {
          deletedAt: null,
          OR: [{ name: contains }, { sku: contains }, { slug: contains }, { brand: contains }],
        },
        select: { id: true, name: true, sku: true, status: true },
        orderBy: { updatedAt: 'desc' },
        take: query.limit,
      }),
      this.prisma.user.findMany({
        where: { OR: [{ fullName: contains }, { email: contains }, { phone: contains }] },
        select: { id: true, fullName: true, email: true },
        orderBy: { createdAt: 'desc' },
        take: query.limit,
      }),
      this.prisma.coupon.findMany({
        where: { code: contains },
        select: { id: true, code: true, type: true, value: true },
        orderBy: { createdAt: 'desc' },
        take: query.limit,
      }),
    ]);

    // Orders first: an operator searching the admin panel is looking for an
    // order far more often than for anything else, and a result list that
    // buries it under three products is one they have to read every time.
    const hits: AdminSearchHit[] = [
      ...orders.map((order) => ({
        type: 'order' as const,
        id: order.id,
        title: order.orderNumber,
        subtitle: `${order.user?.fullName ?? 'Guest'} - ${order.status} - Rs ${Math.round(order.total.toNumber()).toLocaleString('en-NP')}`,
        href: `/admin/orders?search=${encodeURIComponent(order.orderNumber)}`,
      })),
      ...customers.map((user) => ({
        type: 'customer' as const,
        id: user.id,
        title: user.fullName,
        subtitle: user.email,
        href: `/admin/customers/${user.id}`,
      })),
      ...products.map((product) => ({
        type: 'product' as const,
        id: product.id,
        title: product.name,
        subtitle: `${product.sku} - ${product.status}`,
        href: `/admin/products/${product.id}/edit`,
      })),
      ...coupons.map((coupon) => ({
        type: 'coupon' as const,
        id: coupon.id,
        title: coupon.code,
        subtitle: `${coupon.type} - ${coupon.value.toNumber()}`,
        href: `/admin/coupons?search=${encodeURIComponent(coupon.code)}`,
      })),
    ];

    return { hits, took: Date.now() - started };
  }
}
