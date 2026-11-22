/**
 * Small runtime config that isn't (yet) in the database.
 */

/** TEST while PAYTABS_MODE isn't "LIVE" (shown in the admin shell). */
export const GATEWAY_MODE: "TEST" | "LIVE" =
  process.env.PAYTABS_MODE === "LIVE" ? "LIVE" : "TEST";

/** Version stamp stored on a Transaction when the consent checkboxes are ticked. */
export const CONSENT_VERSION = "2026-09-03";

/** While false, the checkout hand-off page exposes a "confirm payment" button
 *  that stands in for the gateway callback. PAYMENTS_LIVE=true + PAYTABS_* = real PayTabs checkout. */
export const PAYMENTS_LIVE = process.env.PAYMENTS_LIVE === "true";

/** The manual "record successful payment" affordance mints a real membership for
 *  free, so it is opt-in (never just "on because payments aren't live yet").
 *  Set ALLOW_SIMULATED_PAYMENT=true only on an internal demo deploy. */
export const ALLOW_SIMULATED_PAYMENT =
  !PAYMENTS_LIVE && process.env.ALLOW_SIMULATED_PAYMENT === "true";

/** Transactional email (SendGrid). Sending is a no-op unless EMAILS_ENABLED is
 *  "true" AND SENDGRID_API_KEY is set — so a missing key never breaks checkout. */
export const EMAILS_ENABLED =
  process.env.EMAILS_ENABLED === "true" && Boolean(process.env.SENDGRID_API_KEY);
export const EMAIL_FROM = process.env.EMAIL_FROM || "Belsalameh <support@belsalameh.com>";
export const EMAIL_COMPANY_NOTIFY = process.env.EMAIL_COMPANY_NOTIFY || "support@belsalameh.com";
