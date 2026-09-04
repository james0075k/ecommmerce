import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { addToCartSchema, applyCouponSchema, updateCartItemSchema } from '@bazaar/shared';
import type {
  AddToCartInput,
  ApplyCouponInput,
  CartView,
  CouponValidationResult,
  UpdateCartItemInput,
} from '@bazaar/shared';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OptionalAuth } from '../common/decorators/optional-auth.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { CartService } from './cart.service';
import { resolveCartOwner, type CartOwner } from './cart-session';

/**
 * The cart is the one part of the storefront that has to work identically for a
 * signed-out visitor and a signed-in shopper, so every route here is
 * @OptionalAuth: a Bearer token picks the user's cart, its absence falls back to
 * the `bz_cart` guest cookie.
 */
@OptionalAuth()
@Controller('cart')
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  getCart(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CartView> {
    // `mutating: false` - a read must not mint a session cookie for every bot
    // that loads the page.
    return this.cart.getCart(resolveCartOwner(user?.id, request, response, false));
  }

  /** The navbar badge polls this instead of pulling the whole cart. */
  @Get('count')
  getCount(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ count: number }> {
    return this.cart.getCount(resolveCartOwner(user?.id, request, response, false));
  }

  @Post('items')
  addItem(
    @Body(new ZodValidationPipe(addToCartSchema)) dto: AddToCartInput,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CartView> {
    return this.cart.addItem(this.owner(user, request, response), dto);
  }

  @Patch('items/:id')
  updateItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateCartItemSchema)) dto: UpdateCartItemInput,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CartView> {
    return this.cart.updateItem(this.owner(user, request, response), id, dto.quantity);
  }

  @Delete('items/:id')
  removeItem(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CartView> {
    return this.cart.removeItem(this.owner(user, request, response), id);
  }

  @Delete()
  clear(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CartView> {
    return this.cart.clear(this.owner(user, request, response));
  }

  /* --- Coupons ----------------------------------------------------------- */

  @Post('apply-coupon')
  @HttpCode(HttpStatus.OK)
  applyCoupon(
    @Body(new ZodValidationPipe(applyCouponSchema)) dto: ApplyCouponInput,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CouponValidationResult> {
    return this.cart.applyCoupon(this.owner(user, request, response), dto.code);
  }

  @Delete('coupon')
  removeCoupon(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CartView> {
    return this.cart.removeCoupon(this.owner(user, request, response));
  }

  /** Write routes always have an owner - a guest session is minted if needed. */
  private owner(
    user: AuthenticatedUser | undefined,
    request: Request,
    response: Response,
  ): CartOwner {
    // Non-null by construction: `mutating: true` never returns null.
    return resolveCartOwner(user?.id, request, response, true) as CartOwner;
  }
}
