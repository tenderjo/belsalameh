import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * PayTabs hosted-payment-page client (PT2 API). Pure HTTP + helpers — no DB, so it
 * can be unit-checked (see scripts/paytabs-check.ts). The order lifecycle that uses
 * it lives in `settleByReference()` in payments.ts.
 *
 * Docs: https://docs.paytabs.com/manuals/PT-API-Endpoints/Integration-Types-Manuals/Hosted-Payment-Page/
 */

const profileId = () => process.env.PAYTABS_PROFILE_ID ?? "";
const serverKey = () => process.env.PAYTABS_SERVER_KEY ?? "";
/** Regional endpoint — wrong region = auth error. Jordan accounts use secure-jordan. */
const baseUrl = () => (process.env.PAYTABS_BASE_URL || "https://secure-jordan.paytabs.com").replace(/\/+$/, "");
const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");

export const paytabsConfigured = () => Boolean(profileId() && serverKey());

/** JOD has 3 decimals (1000 fils), everything else we sell in has 2. */
export function toMajor(amountMinor: number, currency: string): number {
  return currency === "JOD" ? amountMinor / 1000 : amountMinor / 100;
}

/** Hex HMAC-SHA256 of the raw body with the profile server key, compared in constant time. */
export function verifyWebhookSignature(rawBody: string, header: string | null, key = serverKey()): boolean {
  if (!header || !key) return false;
  const expected = createHmac("sha256", key).update(rawBody).digest();
  const given = Buffer.from(header.trim().toLowerCase(), "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

async function call<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method: "POST",
    headers: { authorization: serverKey(), "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`PayTabs ${path} returned non-JSON (${res.status})`);
  }
  if (!res.ok) {
    const msg = (json as { message?: string }).message ?? text.slice(0, 200);
    throw new Error(`PayTabs ${path} failed (${res.status}): ${msg}`);
  }
  return json as T;
}

/** Creates a hosted payment page for an order; send the buyer to `redirectUrl`. */
export async function createHostedPayment(o: {
  reference: string;
  amountMinor: number;
  currency: string;
  description: string;
  customer: { name: string; email: string; ip?: string };
}): Promise<{ tranRef: string; redirectUrl: string }> {
  const r = await call<{ tran_ref?: string; redirect_url?: string }>("/payment/request", {
    profile_id: Number(profileId()),
    tran_type: "sale",
    tran_class: "ecom",
    cart_id: o.reference,
    cart_currency: o.currency,
    cart_amount: toMajor(o.amountMinor, o.currency),
    cart_description: o.description,
    // PayTabs POSTs the buyer back here (fields: tranRef, cartId, respStatus…) and the
    // server-to-server callback goes to the webhook. Neither is trusted: both are re-queried.
    return: `${siteUrl()}/checkout/return`,
    // PayTabs rejects non-public callbacks, so local dev (http://localhost) relies on the return alone.
    ...(/^https:\/\/(?!localhost)/.test(siteUrl()) ? { callback: `${siteUrl()}/api/webhooks/paytabs` } : {}),
    hide_shipping: true,
    customer_details: {
      name: o.customer.name,
      email: o.customer.email,
      country: "JO",
      ...(o.customer.ip ? { ip: o.customer.ip } : {}),
    },
  });
  if (!r.tran_ref || !r.redirect_url) throw new Error("PayTabs did not return a payment page");
  return { tranRef: r.tran_ref, redirectUrl: r.redirect_url };
}

export type PaytabsQuery = {
  tran_ref: string;
  cart_id: string;
  cart_amount: string | number;
  cart_currency: string;
  payment_result?: { response_status?: string; response_message?: string };
};

/** Source of truth for a payment: ask PayTabs directly instead of trusting a callback body. */
export function queryTransaction(tranRef: string): Promise<PaytabsQuery> {
  return call<PaytabsQuery>("/payment/query", { profile_id: Number(profileId()), tran_ref: tranRef });
}
