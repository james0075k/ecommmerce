import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { cancelOrderSchema, checkoutInputSchema, orderQuerySchema } from '@bazaar/shared';
import type {
  CancelOrderInput,
  CheckoutInput,
  CheckoutResult,
  OrderDetail,
  OrderListItem,
  OrderQueryInput,
  Paginated,
} from '@bazaar/shared';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OptionalAuth } from '../common/decorators/optional-auth.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { resolveCartOwner, type CartOwner } from '../cart/cart-session';
import { InvoiceService } from './invoice.service';
import { OrdersService } from './orders.service';

/**
 * Guest checkout is supported (G1), so these routes are @OptionalAuth for the
 * same reason the cart's are: the same endpoint has to serve a shopper with a
 * token and a guest with only the `bz_cart` cookie.
 *
 * A guest order is then reachable by its uuid alone, which is what the
 * confirmation email links to. `findOne` still refuses to hand a *user's* order
 * to a different account.
 */
@OptionalAuth()
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly invoices: InvoiceService,
  ) {}

  /**
   * The order history page. Signed-in only - a guest has no list, because there
   * is nothing tying their orders together except the uuids in their inbox.
   */
  @Get()
  list(
    @Query(new ZodValidationPipe(orderQuerySchema)) query: OrderQueryInput,
    @CurrentUser() user: AuthenticatedUser | undefined,
  ): Promise<Paginated<OrderListItem>> {
    if (!user) {
      return Promise.resolve({
        items: [],
        meta: {
          page: query.page,
          limit: query.limit,
          total: 0,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      });
    }

    return this.orders.listForUser(user.id, query);
  }

  @Post('checkout')
  @HttpCode(HttpStatus.CREATED)
  checkout(
    @Body(new ZodValidationPipe(checkoutInputSchema)) dto: CheckoutInput,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CheckoutResult> {
    // Not `mutating` - checking out without a cart is already an error, and a
    // fresh guest session would only produce an empty one.
    const owner = resolveCartOwner(user?.id, request, response, false);

    if (!owner) {
      throw new BadRequestException('Your cart is empty.');
    }

    return this.orders.checkout(owner as CartOwner, dto, user?.id);
  }

  /** The detail page: the order, its full status history and any refunds. */
  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser | undefined,
  ): Promise<OrderDetail> {
    return this.orders.findDetail(id, user?.id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(cancelOrderSchema)) dto: CancelOrderInput,
    @CurrentUser() user: AuthenticatedUser | undefined,
  ): Promise<OrderDetail> {
    return this.orders.cancel(id, user?.id, dto.reason);
  }

  /**
   * The VAT invoice as a PDF.
   *
   * `inline` rather than `attachment` so the browser's own viewer opens it -
   * the shopper can then read it and decide to save, which is one fewer step
   * than a forced download they have to go and find.
   */
  @Get(':id/invoice')
  async invoice(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const order = await this.orders.findForInvoice(id, user?.id);
    const pdf = await this.invoices.render(order);

    response.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="invoice-${order.orderNumber}.pdf"`,
      'Content-Length': String(pdf.length),
      // An invoice is personal - no shared cache should hold a copy.
      'Cache-Control': 'private, no-store',
    });

    response.end(pdf);
  }
}
