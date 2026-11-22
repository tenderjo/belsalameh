import { db } from "@/lib/db";
import { settleByReference } from "@/lib/payments";
import { verifyWebhookSignature } from "@/lib/paytabs";

/**
 * PayTabs server-to-server callback (IPN). Verify signature → dedupe via WebhookEvent →
 * settle. The body is only a hint about which order to look at: settleByReference()
 * re-queries PayTabs, so a forged or replayed body can't create a membership.
 * PayTabs retries until it gets a 2xx, so processed/ignored events answer 200.
 */
export async function POST(req: Request) {
  if (!process.env.PAYTABS_SERVER_KEY) return new Response("PayTabs not configured", { status: 501 });

  const raw = await req.text();
  const signatureValid = verifyWebhookSignature(raw, req.headers.get("signature"));
  if (!signatureValid) {
    await db.webhookEvent
      .create({ data: { provider: "PAYTABS", dedupeKey: `paytabs:bad:${Date.now()}:${Math.random()}`, signatureValid, payload: raw.slice(0, 4000), result: "error", error: "invalid signature" } })
      .catch(() => {});
    return new Response("Invalid signature", { status: 400 });
  }

  let p: { tran_ref?: string; cart_id?: string; payment_result?: { response_status?: string } };
  try {
    p = JSON.parse(raw);
  } catch {
    return new Response("Bad payload", { status: 400 });
  }
  const tranRef = String(p.tran_ref ?? "");
  const reference = String(p.cart_id ?? "");
  if (!tranRef || !reference) return new Response("Missing tran_ref/cart_id", { status: 400 });

  const dedupeKey = `paytabs:${tranRef}:${p.payment_result?.response_status ?? "?"}`;
  const existing = await db.webhookEvent.findUnique({ where: { dedupeKey } });
  if (existing?.processedAt) return Response.json({ ok: true, deduped: true });
  const event = existing ?? (await db.webhookEvent.create({ data: { provider: "PAYTABS", dedupeKey, signatureValid, payload: raw } }));

  const r = await settleByReference(reference, tranRef);
  const ok = r.state === "paid" || r.state === "declined" || r.state === "pending";
  await db.webhookEvent.update({
    where: { id: event.id },
    data: {
      processedAt: r.state === "error" ? null : new Date(), // errors stay retryable
      result: r.state === "paid" ? "ok" : ok ? "ignored" : "error",
      error: r.state === "error" ? r.reason : r.state === "not_found" ? "unknown order" : null,
    },
  });

  // Gateway hiccups → 500 so PayTabs retries; everything else is final.
  return r.state === "error" ? new Response("retry", { status: 500 }) : Response.json({ ok: true, state: r.state });
}
