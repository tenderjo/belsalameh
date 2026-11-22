import { NextResponse } from "next/server";
import { settleByReference } from "@/lib/payments";

/**
 * Where PayTabs sends the buyer after the hosted page (it POSTs a form; GET kept for safety).
 * The fields are NOT trusted — they only say which order/transaction to ask PayTabs about.
 */
async function handle(req: Request) {
  let cartId = "";
  let tranRef = "";
  if (req.method === "POST") {
    const f = await req.formData().catch(() => null);
    cartId = String(f?.get("cartId") ?? "");
    tranRef = String(f?.get("tranRef") ?? "");
  } else {
    const q = new URL(req.url).searchParams;
    cartId = q.get("cartId") ?? q.get("ref") ?? "";
    tranRef = q.get("tranRef") ?? "";
  }

  const site = (process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin).replace(/\/+$/, "");
  const to = (path: string) => NextResponse.redirect(`${site}${path}`, 303); // 303: POST → GET
  if (!cartId) return to("/");

  const r = await settleByReference(cartId, tranRef || undefined);
  const q = encodeURIComponent(cartId);
  if (r.state === "paid") return to(`/checkout/success?ref=${q}`);
  if (r.state === "declined") return to(`/checkout/processing?ref=${q}&declined=1`);
  return to(`/checkout/processing?ref=${q}`); // pending / error: page re-checks and shows status
}

export const GET = handle;
export const POST = handle;
