/**
 * Smallest check for the PayTabs glue. Offline asserts always run:
 *   npx tsx scripts/paytabs-check.ts
 * With --live (needs PAYTABS_* in .env.local) it also creates a real TEST hosted
 * payment and prints the URL to open and pay with a PayTabs test card, then queries it:
 *   npx tsx --env-file=.env.local scripts/paytabs-check.ts --live
 */
import { createHmac } from "node:crypto";
import { toMajor, verifyWebhookSignature, createHostedPayment, queryTransaction, paytabsConfigured } from "../src/lib/paytabs";

const assert = (c: unknown, m: string) => { if (!c) throw new Error("FAIL: " + m); console.log("ok  " + m); };

assert(toMajor(12500, "JOD") === 12.5, "JOD minor→major uses 3 decimals");
assert(toMajor(1999, "USD") === 19.99, "other currencies use 2 decimals");
const body = JSON.stringify({ tran_ref: "TST1", cart_id: "BSL-ORD-X" });
const sig = createHmac("sha256", "k").update(body).digest("hex");
assert(verifyWebhookSignature(body, sig, "k"), "valid signature accepted");
assert(!verifyWebhookSignature(body + " ", sig, "k"), "tampered body rejected");
assert(!verifyWebhookSignature(body, sig, "other"), "wrong key rejected");
assert(!verifyWebhookSignature(body, null, "k") && !verifyWebhookSignature(body, "zz", "k"), "missing/garbage header rejected");

async function main() {
  if (process.argv.includes("--live")) {
    assert(paytabsConfigured(), "PAYTABS_PROFILE_ID / PAYTABS_SERVER_KEY are set");
    const ref = "BSL-CHECK-" + Date.now();
    const { tranRef, redirectUrl } = await createHostedPayment({
      reference: ref, amountMinor: 1000, currency: "JOD", description: "paytabs-check", customer: { name: "Test Buyer", email: "test@example.com" },
    });
    console.log("\nOpen this URL and pay with a PayTabs TEST card:\n" + redirectUrl + "\n");
    const q = await queryTransaction(tranRef);
    assert(q.cart_id === ref, "query returns our cart_id");
    console.log("status now:", q.payment_result?.response_status ?? "(none yet)", "| tran_ref:", tranRef);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
