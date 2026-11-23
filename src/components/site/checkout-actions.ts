"use server";

import { redirect } from "next/navigation";
import { NAME_TAKEN_MESSAGE, checkoutSchema, toFieldErrors, type CheckoutFieldErrors, type CheckoutState } from "@/lib/checkout";
import { checkPeople, type PersonCheck } from "@/lib/identity";
import { db } from "@/lib/db";
import { PAYMENTS_LIVE } from "@/lib/config";
import { createPendingTransaction } from "@/lib/payments";
import { createHostedPayment, paytabsConfigured } from "@/lib/paytabs";
import { getMembershipSettings } from "@/lib/membership-settings";
import { PAYMENTS_PAUSED_MESSAGE } from "@/lib/membership";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/**
 * Validates the checkout form, creates a PENDING transaction, and hands off to the
 * PayTabs hosted payment page (PAYMENTS_LIVE=true + PAYTABS_* set). Otherwise it goes
 * to the demo hand-off page. The webhook / return route look the order up by `reference`.
 */
export async function startCheckout(
  _prev: CheckoutState,
  formData: FormData,
): Promise<CheckoutState> {
  // Admin paused payments (Settings): refuse even if a stale pop-up still shows the form.
  if ((await getMembershipSettings()).paymentsPaused) {
    return { errors: {}, formError: PAYMENTS_PAUSED_MESSAGE };
  }

  // Extra people arrive as parallel lists (one name + one, possibly empty, email per row).
  const partyNames = formData.getAll("partyName").map(String);
  const partyEmails = formData.getAll("partyEmail").map(String);

  const parsed = checkoutSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    confirmEmail: formData.get("confirmEmail"),
    party: partyNames.map((fullName, i) => ({ fullName, email: partyEmails[i] ?? "" })),
    agreeTerms: formData.get("agreeTerms"),
    confirmPrivacy: formData.get("confirmPrivacy"),
    confirmAdult: formData.get("confirmAdult"),
  });

  if (!parsed.success) {
    return { errors: toFieldErrors(parsed.error), formError: "Please correct the highlighted fields." };
  }

  // Throttle bot spam into the Transaction table. ponytail: in-memory per-instance;
  // add Cloudflare Turnstile here if you need real bot resistance.
  const ip = await clientIp();
  const allowed =
    rateLimit(`checkout:ip:${ip}`, 5, 10 * 60_000) &&
    rateLimit(`checkout:email:${parsed.data.email}`, 3, 60 * 60_000);
  if (!allowed) {
    return { errors: {}, formError: "Too many attempts. Please wait a few minutes and try again." };
  }

  // Same name = duplicate registration (blocked). Same email under another name is fine, so it is not checked here.
  const checks = await checkPeople([parsed.data, ...parsed.data.party]);
  const taken: CheckoutFieldErrors = {};
  if (checks[0].nameTaken) taken.fullName = NAME_TAKEN_MESSAGE;
  checks.slice(1).forEach((c, i) => {
    if (!c.nameTaken) return;
    taken.party ??= {};
    taken.party[i] = { fullName: NAME_TAKEN_MESSAGE };
  });
  if (taken.fullName || taken.party) return { errors: taken, formError: "Please correct the highlighted fields." };

  const { reference } = await createPendingTransaction({
    fullName: parsed.data.fullName,
    email: parsed.data.email,
    party: parsed.data.party,
    adultConfirmed: parsed.data.confirmAdult,
  });

  if (PAYMENTS_LIVE && paytabsConfigured()) {
    const txn = await db.transaction.findUniqueOrThrow({ where: { reference } });
    let redirectUrl: string;
    try {
      const page = await createHostedPayment({
        reference,
        amountMinor: txn.amountMinor,
        currency: txn.currency,
        description: `Belsalameh membership × ${1 + parsed.data.party.length}`,
        customer: { name: parsed.data.fullName, email: parsed.data.email, ip },
      });
      await db.transaction.update({ where: { id: txn.id }, data: { providerRef: page.tranRef } });
      redirectUrl = page.redirectUrl;
    } catch (e) {
      console.error(`[checkout] could not start PayTabs payment for ${reference}`, e);
      return { errors: {}, formError: "We couldn't reach the payment provider. Please try again in a moment." };
    }
    redirect(redirectUrl); // outside try/catch: redirect() works by throwing
  }

  redirect(`/checkout/processing?ref=${encodeURIComponent(reference)}`);
}

/**
 * Live check used while the form is being filled in (name already registered? email already used
 * under another name?). Rate-limited; the same name rule is enforced again on submit above.
 */
export async function checkPeopleAction(people: { fullName: string; email: string }[]): Promise<PersonCheck[]> {
  const list = people.slice(0, 10).map((p) => ({ fullName: String(p.fullName ?? "").slice(0, 120), email: String(p.email ?? "").slice(0, 256) }));
  const ip = await clientIp();
  if (!rateLimit(`check:ip:${ip}`, 60, 10 * 60_000)) return list.map(() => ({ nameTaken: false, emailShared: false }));
  return checkPeople(list);
}
