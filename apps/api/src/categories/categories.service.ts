import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Category } from '@prisma/client';
import type { CategoryInput, CategoryUpdateInput } from '@bazaar/shared';

import { CacheService } from '../common/redis/cache.service';
import { PrismaService } from '../prisma/prisma.service';

export interface CategoryNode extends Category {
  children: CategoryNode[];
  productCount: number;
}

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /**
   * The whole tree in one query, assembled in memory.
   *
   * A recursive CTE would be the alternative, but a catalog has tens of
   * categories, not thousands - one flat read plus an O(n) assembly is simpler
   * and avoids raw SQL, which the blueprint rules out.
   */
  async getTree(includeInactive = false): Promise<CategoryNode[]> {
    // Cached for an hour (Phase 11). The tree is on every page - the mega menu,
    // the mobile drawer, the filter rail - and changes only when an admin edits
    // it, at which point `invalidate` below drops the whole namespace.
    return this.cache.getOrSet('categories', `tree:${includeInactive ? 'all' : 'active'}`, () =>
      this.readTree(includeInactive),
    );
  }

  private async readTree(includeInactive: boolean): Promise<CategoryNode[]> {
    const categories = await this.prisma.category.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        _count: {
          select: { products: { where: { isActive: true, deletedAt: null } } },
        },
      },
    });

    const nodes = new Map<string, CategoryNode>(
      categories.map((category) => [
        category.id,
        { ...category, children: [], productCount: category._count.products },
      ]),
    );

    const roots: CategoryNode[] = [];

    for (const category of categories) {
      const node = nodes.get(category.id);
      if (!node) continue;

      const parent = category.parentId ? nodes.get(category.parentId) : undefined;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }

    // A parent's count should include everything beneath it, so a shopper
    // filtering on "Electronics" sees the total, not just directly-tagged items.
    for (const root of roots) rollUpCounts(root);

    return roots;
  }

  async findBySlug(slug: string): Promise<Category> {
    const category = await this.prisma.category.findUnique({ where: { slug } });
    if (!category) throw new NotFoundException('Category not found.');
    return category;
  }

  /** A category and every descendant - used to filter products by a parent. */
  async collectDescendantIds(categoryId: string): Promise<string[]> {
    const all = await this.prisma.category.findMany({
      select: { id: true, parentId: true },
    });

    const childrenOf = new Map<string, string[]>();
    for (const { id, parentId } of all) {
      if (!parentId) continue;
      childrenOf.set(parentId, [...(childrenOf.get(parentId) ?? []), id]);
    }

    const ids: string[] = [];
    const queue = [categoryId];

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) break;
      ids.push(current);
      queue.push(...(childrenOf.get(current) ?? []));
    }

    return ids;
  }

  /* --- Admin ------------------------------------------------------------- */

  async create(dto: CategoryInput): Promise<Category> {
    await this.assertSlugFree(dto.slug);

    if (dto.parentId) {
      await this.assertExists(dto.parentId);
    }

    const created = await this.prisma.category.create({ data: dto });
    await this.cache.invalidate('categories');
    return created;
  }

  async update(id: string, dto: CategoryUpdateInput): Promise<Category> {
    const existing = await this.assertExists(id);

    if (dto.slug && dto.slug !== existing.slug) {
      await this.assertSlugFree(dto.slug);
    }

    if (dto.parentId !== undefined && dto.parentId !== null) {
      if (dto.parentId === id) {
        throw new BadRequestException('A category cannot be its own parent.');
      }
      // Reparenting under a descendant would detach the subtree from the root
      // and make getTree drop it silently.
      const descendants = await this.collectDescendantIds(id);
      if (descendants.includes(dto.parentId)) {
        throw new BadRequestException('A category cannot be moved beneath one of its own children.');
      }
      await this.assertExists(dto.parentId);
    }

    const updated = await this.prisma.category.update({ where: { id }, data: dto });
    // A rename, a reparent or a deactivation all change the shape of the tree,
    // and a stale menu that links to a category that is no longer there is a
    // 404 the shopper did nothing to earn.
    await this.cache.invalidate('categories');
    return updated;
  }

  async remove(id: string): Promise<{ message: string }> {
    await this.assertExists(id);

    const [childCount, productCount] = await Promise.all([
      this.prisma.category.count({ where: { parentId: id } }),
      this.prisma.product.count({ where: { categoryId: id, deletedAt: null } }),
    ]);

    if (childCount > 0) {
      throw new ConflictException(
        `This category has ${childCount} sub-categories. Move or delete them first.`,
      );
    }

    if (productCount > 0) {
      throw new ConflictException(
        `This category still holds ${productCount} products. Move them to another category first.`,
      );
    }

    await this.prisma.category.delete({ where: { id } });
    await this.cache.invalidate('categories');
    return { message: 'Category deleted.' };
  }

  private async assertExists(id: string): Promise<Category> {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Category not found.');
    return category;
  }

  private async assertSlugFree(slug: string): Promise<void> {
    const clash = await this.prisma.category.findUnique({ where: { slug } });
    if (clash) throw new ConflictException(`The slug "${slug}" is already in use.`);
  }
}

/** Adds each subtree's product count into its parent, depth-first. */
function rollUpCounts(node: CategoryNode): number {
  for (const child of node.children) {
    node.productCount += rollUpCounts(child);
  }
  return node.productCount;
}
