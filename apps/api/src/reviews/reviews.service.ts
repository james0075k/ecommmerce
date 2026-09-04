import { Injectable } from '@nestjs/common';
import type { Paginated, PaginationInput, PublicReview } from '@bazaar/shared';

import { PrismaService } from '../prisma/prisma.service';

/**
 * Read-only review listing.
 *
 * Writing reviews is Phase 7 and is not implemented here. This exists because
 * the AI review summary (E4) is a card that sits *above the individual
 * reviews*, and a consensus with nothing underneath it is unverifiable - a
 * shopper has to be able to check the summary against what people actually
 * wrote. Only approved reviews are ever returned (D2).
 */
@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForProduct(
    productId: string,
    query: PaginationInput,
  ): Promise<Paginated<PublicReview>> {
    const where = { productId, isApproved: true };

    const [rows, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        select: {
          id: true,
          rating: true,
          title: true,
          body: true,
          images: true,
          isVerifiedPurchase: true,
          helpfulCount: true,
          createdAt: true,
          user: { select: { fullName: true } },
        },
        // Helpful votes first: the reviews other shoppers found useful are the
        // ones worth reading, and it matches the sample the summary is built
        // from so the card and the list tell the same story.
        orderBy: [{ helpfulCount: 'desc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.review.count({ where }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / query.limit));

    return {
      items: rows.map((row) => ({
        id: row.id,
        rating: row.rating,
        title: row.title,
        body: row.body,
        images: row.images,
        isVerifiedPurchase: row.isVerifiedPurchase,
        helpfulCount: row.helpfulCount,
        // Surnames are not shown. A review is a public statement about a
        // product, not a directory entry about the person who wrote it.
        authorName: displayName(row.user?.fullName ?? null),
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
}

/** "Anisha Shrestha" -> "Anisha S."; a deleted account -> "Bazaar customer". */
function displayName(fullName: string | null): string {
  if (!fullName) return 'Bazaar customer';

  const [first, ...rest] = fullName.trim().split(/\s+/);
  if (!first) return 'Bazaar customer';

  const last = rest.at(-1);
  return last ? `${first} ${last.charAt(0).toUpperCase()}.` : first;
}
