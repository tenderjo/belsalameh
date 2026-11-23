import "server-only";
import { db } from "./db";
import { MEMBERSHIP, type MembershipPlan } from "./membership";

export type MembershipSettings = MembershipPlan & { paymentsPaused: boolean };

/** The plan being sold right now: the admin's saved settings, or the built-in defaults if none saved yet. */
export async function getMembershipSettings(): Promise<MembershipSettings> {
  const row = await db.membershipSettings.findUnique({ where: { id: "default" } });
  return {
    name: MEMBERSHIP.name,
    currency: MEMBERSHIP.currency,
    priceMinor: row?.priceMinor ?? MEMBERSHIP.priceMinor,
    durationMonths: row?.durationMonths ?? MEMBERSHIP.durationMonths,
    paymentsPaused: row?.paymentsPaused ?? false,
  };
}

export async function saveMembershipSettings(input: {
  priceMinor: number;
  durationMonths: number;
}): Promise<void> {
  await db.membershipSettings.upsert({
    where: { id: "default" },
    create: { id: "default", ...input },
    update: input,
  });
}

/** Admin kill switch: while paused the public checkout is hidden and startCheckout refuses new orders. */
export async function setPaymentsPaused(paymentsPaused: boolean): Promise<void> {
  await db.membershipSettings.upsert({
    where: { id: "default" },
    create: { id: "default", priceMinor: MEMBERSHIP.priceMinor, durationMonths: MEMBERSHIP.durationMonths, paymentsPaused },
    update: { paymentsPaused },
  });
}
