import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import PDFDocument from 'pdfkit';
import type { Prisma } from '@prisma/client';
import { DEFAULT_TAX_RATE } from '@bazaar/shared';

/** Enough of an order row to draw an invoice; matches ORDER_INCLUDE. */
export interface InvoiceOrder {
  orderNumber: string;
  createdAt: Date;
  placedAt: Date | null;
  currency: string;
  subtotal: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  shippingCost: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  total: Prisma.Decimal;
  status: string;
  shippingAddress: Prisma.JsonValue;
  guestEmail: string | null;
  items: Array<{
    productName: string;
    variantName: string | null;
    sku: string;
    quantity: number;
    unitPrice: Prisma.Decimal;
    totalPrice: Prisma.Decimal;
  }>;
  payments: Array<{
    method: string;
    status: string;
    transactionId: string | null;
    paidAt: Date | null;
  }>;
}

/* Page geometry, in points. A4 is 595x842. */
const MARGIN = 48;
const PAGE_WIDTH = 595;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

/*
 * Line-item table geometry. The widths are sized for the longest string each
 * column can hold: the AMOUNT column has to fit "NPR 12345.67" at 12pt bold for
 * the Total row, which is wider than any of the 10pt rows above it.
 */
const COL_ITEM = MARGIN;
const ITEM_WIDTH = 250;
const COL_QTY = MARGIN + 262;
const QTY_WIDTH = 30;
const COL_UNIT = MARGIN + 302;
const UNIT_WIDTH = 90;
const COL_TOTAL = MARGIN + 409;
const TOTAL_WIDTH = 90;

/* The totals block reuses the AMOUNT column, with its label filling the rest. */
const COL_TOTALS_LABEL = MARGIN + 200;
const TOTALS_LABEL_WIDTH = 201;

const INK = '#1A1A2E';
const MUTED = '#5B6478';
const RULE = '#E6E9F0';
const BRAND = '#6C3CE1';

@Injectable()
export class InvoiceService {
  constructor(private readonly config: ConfigService) {}

  /**
   * Renders a VAT invoice as a PDF buffer.
   *
   * Buffered rather than streamed straight to the response: the total byte
   * length has to be known for `Content-Length`, and a mid-render failure
   * should produce a clean 500 rather than a truncated file the browser saves
   * anyway as a corrupt download.
   */
  render(order: InvoiceOrder): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: MARGIN });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      try {
        this.draw(doc, order);
        doc.end();
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  /* --------------------------------------------------------------------- */

  private draw(doc: PDFKit.PDFDocument, order: InvoiceOrder): void {
    const money = (value: Prisma.Decimal | number) =>
      `${order.currency} ${Number(value).toFixed(2)}`;

    this.header(doc, order);
    this.parties(doc, order);

    let y = doc.y + 16;
    y = this.tableHeader(doc, y);

    for (const item of order.items) {
      // Start a new page before a row would fall off the bottom, and repeat the
      // header there so a two-page invoice stays readable.
      if (y > 700) {
        doc.addPage();
        y = MARGIN;
        y = this.tableHeader(doc, y);
      }

      y = this.itemRow(doc, y, item, money);
    }

    y = this.totals(doc, y + 8, order, money);
    this.paymentBlock(doc, y + 24, order);
    this.footer(doc);
  }

  private header(doc: PDFKit.PDFDocument, order: InvoiceOrder): void {
    doc
      .fillColor(BRAND)
      .fontSize(22)
      .font('Helvetica-Bold')
      .text('Bazaar', MARGIN, MARGIN);

    doc
      .fillColor(MUTED)
      .fontSize(9)
      .font('Helvetica')
      .text(this.storeAddress(), MARGIN, doc.y + 2, { width: 240 });

    // Right-aligned block, drawn from the same top edge as the logo.
    doc
      .fillColor(INK)
      .fontSize(16)
      .font('Helvetica-Bold')
      .text('TAX INVOICE', MARGIN, MARGIN, { width: CONTENT_WIDTH, align: 'right' });

    doc
      .fillColor(MUTED)
      .fontSize(10)
      .font('Helvetica')
      .text(order.orderNumber, MARGIN, MARGIN + 22, {
        width: CONTENT_WIDTH,
        align: 'right',
      })
      .text(formatDate(order.placedAt ?? order.createdAt), MARGIN, MARGIN + 36, {
        width: CONTENT_WIDTH,
        align: 'right',
      });

    const panNumber = this.config.get<string>('STORE_PAN');
    if (panNumber) {
      doc.text(`PAN: ${panNumber}`, MARGIN, MARGIN + 50, {
        width: CONTENT_WIDTH,
        align: 'right',
      });
    }

    doc.moveTo(MARGIN, MARGIN + 78).lineTo(PAGE_WIDTH - MARGIN, MARGIN + 78).strokeColor(RULE).stroke();
    doc.y = MARGIN + 92;
  }

  private parties(doc: PDFKit.PDFDocument, order: InvoiceOrder): void {
    const address = readAddress(order.shippingAddress);
    const top = doc.y;

    doc
      .fillColor(MUTED)
      .fontSize(8)
      .font('Helvetica-Bold')
      .text('BILL TO', MARGIN, top);

    doc
      .fillColor(INK)
      .fontSize(10)
      .font('Helvetica')
      .text(
        [
          address.fullName,
          address.street,
          `${address.city}, ${address.district}`,
          `${address.province}, ${address.country}`,
          address.phone,
          order.guestEmail ?? '',
        ]
          .filter(Boolean)
          .join('\n'),
        MARGIN,
        top + 14,
        { width: 240 },
      );

    doc
      .fillColor(MUTED)
      .fontSize(8)
      .font('Helvetica-Bold')
      .text('STATUS', COL_TOTALS_LABEL, top);

    doc
      .fillColor(INK)
      .fontSize(10)
      .font('Helvetica')
      .text(order.status, COL_TOTALS_LABEL, top + 14);

    doc.y = Math.max(doc.y, top + 96);
  }

  private tableHeader(doc: PDFKit.PDFDocument, y: number): number {
    doc.fillColor(MUTED).fontSize(8).font('Helvetica-Bold');
    doc.text('DESCRIPTION', COL_ITEM, y);
    doc.text('QTY', COL_QTY, y, { width: QTY_WIDTH, align: 'right' });
    doc.text('UNIT', COL_UNIT, y, { width: UNIT_WIDTH, align: 'right' });
    doc.text('AMOUNT', COL_TOTAL, y, { width: TOTAL_WIDTH, align: 'right' });

    doc
      .moveTo(MARGIN, y + 13)
      .lineTo(PAGE_WIDTH - MARGIN, y + 13)
      .strokeColor(RULE)
      .stroke();

    return y + 22;
  }

  private itemRow(
    doc: PDFKit.PDFDocument,
    y: number,
    item: InvoiceOrder['items'][number],
    money: (value: Prisma.Decimal | number) => string,
  ): number {
    doc.fillColor(INK).fontSize(10).font('Helvetica');
    doc.text(item.productName, COL_ITEM, y, { width: ITEM_WIDTH });

    const nameHeight = doc.y - y;

    doc.text(String(item.quantity), COL_QTY, y, { width: QTY_WIDTH, align: 'right' });
    doc.text(money(item.unitPrice), COL_UNIT, y, { width: UNIT_WIDTH, align: 'right' });
    doc.text(money(item.totalPrice), COL_TOTAL, y, { width: TOTAL_WIDTH, align: 'right' });

    // The variant and SKU sit under the name in smaller grey type.
    const subtitle = [item.variantName, `SKU ${item.sku}`].filter(Boolean).join(' · ');

    doc
      .fillColor(MUTED)
      .fontSize(8)
      .text(subtitle, COL_ITEM, y + nameHeight, { width: ITEM_WIDTH });

    return y + nameHeight + 16;
  }

  private totals(
    doc: PDFKit.PDFDocument,
    y: number,
    order: InvoiceOrder,
    money: (value: Prisma.Decimal | number) => string,
  ): number {
    doc
      .moveTo(COL_TOTALS_LABEL, y)
      .lineTo(PAGE_WIDTH - MARGIN, y)
      .strokeColor(RULE)
      .stroke();

    let cursor = y + 10;

    const line = (label: string, value: string, bold = false) => {
      doc
        .fillColor(bold ? INK : MUTED)
        .fontSize(bold ? 12 : 10)
        .font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .text(label, COL_TOTALS_LABEL, cursor, {
          width: TOTALS_LABEL_WIDTH,
          align: 'right',
        })
        // `lineBreak: false` guarantees the amount stays on one line - a
        // wrapped "NPR / 4372.10" is the bug this geometry exists to prevent.
        .text(value, COL_TOTAL, cursor, {
          width: TOTAL_WIDTH,
          align: 'right',
          lineBreak: false,
        });

      cursor += bold ? 20 : 15;
    };

    line('Subtotal', money(order.subtotal));

    if (Number(order.discountAmount) > 0) {
      line('Discount', `-${money(order.discountAmount)}`);
    }

    line('Shipping', Number(order.shippingCost) === 0 ? 'Free' : money(order.shippingCost));
    // F1.6: VAT must be shown as its own line for the invoice to be valid.
    line(`VAT (${(DEFAULT_TAX_RATE * 100).toFixed(0)}%)`, money(order.taxAmount));

    doc
      .moveTo(COL_TOTALS_LABEL, cursor + 2)
      .lineTo(PAGE_WIDTH - MARGIN, cursor + 2)
      .strokeColor(RULE)
      .stroke();

    cursor += 10;
    line('Total', money(order.total), true);

    return cursor;
  }

  private paymentBlock(doc: PDFKit.PDFDocument, y: number, order: InvoiceOrder): void {
    const payment = order.payments[0];
    if (!payment) return;

    doc.fillColor(MUTED).fontSize(8).font('Helvetica-Bold').text('PAYMENT', MARGIN, y);

    const details = [
      `Method: ${payment.method}`,
      `Status: ${payment.status}`,
      payment.transactionId ? `Reference: ${payment.transactionId}` : null,
      payment.paidAt ? `Paid: ${formatDate(payment.paidAt)}` : null,
    ].filter(Boolean) as string[];

    doc
      .fillColor(INK)
      .fontSize(10)
      .font('Helvetica')
      .text(details.join('\n'), MARGIN, y + 14, { width: 300 });
  }

  private footer(doc: PDFKit.PDFDocument): void {
    // A4 is 842pt tall with a 48pt margin, so content must end by 794. Placing
    // the rule at 780 left the text below it overflowing onto a second, empty
    // page - pdfkit breaks on the bottom margin even for an explicit y.
    const y = 752;

    doc.moveTo(MARGIN, y).lineTo(PAGE_WIDTH - MARGIN, y).strokeColor(RULE).stroke();

    doc
      .fillColor(MUTED)
      .fontSize(8)
      .font('Helvetica')
      .text(
        'Thank you for shopping with Bazaar. This is a computer-generated invoice and needs no signature.',
        MARGIN,
        y + 8,
        { width: CONTENT_WIDTH, align: 'center' },
      );
  }

  private storeAddress(): string {
    return (
      this.config.get<string>('STORE_ADDRESS') ??
      'Kathmandu, Bagmati\nNepal\nsupport@bazaar.com'
    );
  }
}

/* -------------------------------------------------------------------------- */

interface InvoiceAddress {
  fullName: string;
  phone: string;
  street: string;
  city: string;
  district: string;
  province: string;
  country: string;
}

function readAddress(value: Prisma.JsonValue): InvoiceAddress {
  const raw = (value ?? {}) as Partial<InvoiceAddress>;

  return {
    fullName: raw.fullName ?? '',
    phone: raw.phone ?? '',
    street: raw.street ?? '',
    city: raw.city ?? '',
    district: raw.district ?? '',
    province: raw.province ?? '',
    country: raw.country ?? 'Nepal',
  };
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}
