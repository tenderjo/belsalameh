"use server";

import { revalidatePath } from "next/cache";
import { guard } from "@/lib/guard";
import { audit } from "@/lib/admin-store";
import { getMembershipSettings, saveMembershipSettings, setPaymentsPaused } from "@/lib/membership-settings";
import { firstErrors, planSettingsSchema, type PlanFieldErrors, type PlanState } from "@/lib/plan-schema";

/** Saves the plan being sold. The public join pop-up, checkout and the walk-in tab all read it, so it goes live at once. */
export async function savePlanSettings(_prev: PlanState, formData: FormData): Promise<PlanState> {
  const session = await guard();

  const parsed = planSettingsSchema.safeParse({
    price: formData.get("price"),
    durationMonths: formData.get("durationMonths"),
  });
  if (!parsed.success) {
    return { errors: firstErrors<keyof PlanFieldErrors>(parsed.error), formError: "Please correct the highlighted fields." };
  }

  const { price: priceMinor, durationMonths } = parsed.data;
  const before = await getMembershipSettings();
  await saveMembershipSettings({ priceMinor, durationMonths });

  await audit("settings.membership.updated", {
    actorId: session.user.id,
    entity: "MembershipSettings",
    entityId: "default",
    detail: `price ${before.priceMinor} -> ${priceMinor}, months ${before.durationMonths} -> ${durationMonths}`,
  });

  revalidatePath("/admin/settings");
  return { errors: {}, saved: true };
}

/** Pause / resume online payments. The form posts the state it wants, so a double-click can't flip it back. */
export async function setPaymentsPausedAction(formData: FormData) {
  const session = await guard();
  const paused = formData.get("paused") === "true";
  await setPaymentsPaused(paused);
  await audit(paused ? "settings.payments.paused" : "settings.payments.resumed", {
    actorId: session.user.id,
    entity: "MembershipSettings",
    entityId: "default",
  });
  revalidatePath("/admin/settings");
}
