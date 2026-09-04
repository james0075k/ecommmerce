import { NextResponse } from 'next/server';
import { z } from 'zod';

/**
 * Newsletter capture.
 *
 * This lives in the web app rather than the API because a marketing list is not
 * a commerce record - there is no subscriber table, and adding one to satisfy a
 * homepage form would put an unowned model in the middle of the checkout
 * schema. The address is validated and logged; wiring it to the mail provider
 * is a line in this handler once that account exists.
 *
 * The response is 202 rather than 201 deliberately: nothing has been created,
 * the request has been accepted.
 */
const bodySchema = z.object({
  email: z.string().email().max(254),
});

export async function POST(request: Request): Promise<Response> {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ message: 'Expected a JSON body.' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Enter a valid email address.' },
      { status: 422 },
    );
  }

  // Only the domain is logged. The full address is the thing being collected;
  // writing it to a log file is a second, unaudited copy of it.
  const domain = parsed.data.email.split('@')[1] ?? 'unknown';
  console.info(`[newsletter] signup received (domain: ${domain})`);

  return NextResponse.json({ accepted: true }, { status: 202 });
}
