import type { Metadata } from "next";
import { guard } from "@/lib/guard";
import { PageHeader } from "@/components/admin/page-header";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { getMembershipSettings } from "@/lib/membership-settings";
import { Button } from "@/components/ui/button";
import { PlanForm } from "./plan-form";
import { setPaymentsPausedAction } from "./actions";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  await guard();
  const settings = await getMembershipSettings();

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Settings"
        description="Decide how the membership is sold. Changes apply immediately to the public website, its checkout, and the walk-in tab."
        crumbs={[{ label: "Admin", href: "/admin" }, { label: "Settings" }]}
      />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Online payments</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="text-sm text-ink-muted">
            {settings.paymentsPaused
              ? "Paused. The website hides the payment form and nobody can start a new payment. Walk-in signups still work."
              : "Open. Visitors can join and pay on the website."}
          </p>
          <form action={setPaymentsPausedAction} className="mt-4">
            <input type="hidden" name="paused" value={String(!settings.paymentsPaused)} />
            <Button type="submit" variant={settings.paymentsPaused ? "primary" : "danger"}>
              {settings.paymentsPaused ? "Resume payments" : "Pause payments"}
            </Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Membership plan</CardTitle>
        </CardHeader>
        <CardBody>
          <PlanForm
            initial={{
              priceMinor: settings.priceMinor,
              durationMonths: settings.durationMonths,
            }}
            currency={settings.currency}
          />
        </CardBody>
      </Card>
    </div>
  );
}
