import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { Category } from '@prisma/client';
import { categoryInputSchema, categoryUpdateSchema, UserRole } from '@bazaar/shared';
import type { CategoryInput, CategoryUpdateInput } from '@bazaar/shared';

import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CategoriesService } from './categories.service';
import type { CategoryNode } from './categories.service';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  /** GET /categories - the full tree, active only for shoppers. */
  @Public()
  @Get()
  getTree(@Query('includeInactive') includeInactive?: string): Promise<CategoryNode[]> {
    return this.categories.getTree(includeInactive === 'true');
  }

  @Public()
  @Get(':slug')
  findBySlug(@Param('slug') slug: string): Promise<Category> {
    return this.categories.findBySlug(slug);
  }

  @Roles(UserRole.ADMIN)
  @Post()
  create(
    @Body(new ZodValidationPipe(categoryInputSchema)) dto: CategoryInput,
  ): Promise<Category> {
    return this.categories.create(dto);
  }

  @Roles(UserRole.ADMIN)
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(categoryUpdateSchema)) dto: CategoryUpdateInput,
  ): Promise<Category> {
    return this.categories.update(id, dto);
  }

  @Roles(UserRole.ADMIN)
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<{ message: string }> {
    return this.categories.remove(id);
  }
}
