import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { addToWishlistSchema, moveToCartSchema } from '@bazaar/shared';
import type {
  AddToWishlistInput,
  CartView,
  MoveToCartInput,
  SharedWishlistView,
  WishlistEntry,
  WishlistView,
} from '@bazaar/shared';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { WishlistService } from './wishlist.service';

/**
 * Unlike the cart, the wishlist requires an account - `wishlists.user_id` is
 * non-null, and a saved list only earns its keep by outliving the browser it
 * was made in. The one exception is the share link, which is @Public().
 */
@Controller('wishlist')
export class WishlistController {
  constructor(private readonly wishlist: WishlistService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<WishlistView> {
    return this.wishlist.list(user.id);
  }

  /** Feeds the navbar's saved-count badge. */
  @Get('count')
  count(@CurrentUser() user: AuthenticatedUser): Promise<{ count: number }> {
    return this.wishlist.count(user.id);
  }

  /**
   * Declared before `:id` routes so "shared" is never parsed as an entry id.
   * Nest matches in declaration order.
   */
  @Public()
  @Get('shared/:token')
  listShared(@Param('token') token: string): Promise<SharedWishlistView> {
    return this.wishlist.listShared(token);
  }

  @Post()
  add(
    @Body(new ZodValidationPipe(addToWishlistSchema)) dto: AddToWishlistInput,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<WishlistEntry> {
    return this.wishlist.add(user.id, dto);
  }

  /* --- Sharing ----------------------------------------------------------- */

  @Post('share')
  @HttpCode(HttpStatus.OK)
  share(
    @CurrentUser() user: AuthenticatedUser,
    @Query('regenerate') regenerate?: string,
  ): Promise<{ shareUrl: string; token: string }> {
    return this.wishlist.share(user.id, regenerate === 'true');
  }

  @Delete('share')
  unshare(@CurrentUser() user: AuthenticatedUser): Promise<{ message: string }> {
    return this.wishlist.unshare(user.id);
  }

  /* --- Entries ----------------------------------------------------------- */

  @Post(':id/move-to-cart')
  @HttpCode(HttpStatus.OK)
  moveToCart(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(moveToCartSchema)) dto: MoveToCartInput,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CartView> {
    return this.wishlist.moveToCart(user.id, id, dto);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ message: string }> {
    return this.wishlist.remove(user.id, id);
  }
}
