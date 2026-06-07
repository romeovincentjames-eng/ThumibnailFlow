import { NextResponse } from "next/server";
import { hasStripeConfig } from "@/lib/env";
import { getOrCreateBillingAccount } from "@/lib/billingSession";
import { getRepository } from "@/lib/repository";
import { BILLING_PLANS, POINT_COSTS, TOP_UP_PACKS, getStripePriceId } from "@/lib/points";

export const runtime = "nodejs";

export async function GET() {
  try {
    const account = await getOrCreateBillingAccount();
    const ledger = await getRepository().getPointLedgerForAccount(account.id);
    const stripeConfigured = hasStripeConfig();

    return NextResponse.json({
      account,
      ledger,
      pointCosts: POINT_COSTS,
      stripeConfigured,
      plans: BILLING_PLANS.map((plan) => ({
        ...plan,
        configured: stripeConfigured && Boolean(getStripePriceId(plan.priceEnv))
      })),
      topUps: TOP_UP_PACKS.map((pack) => ({
        ...pack,
        configured: stripeConfigured && Boolean(getStripePriceId(pack.priceEnv))
      }))
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load billing.";
    const needsSchema = /billing_accounts|point_ledger|schema cache|PGRST205/i.test(message);

    return NextResponse.json(
      {
        error: needsSchema
          ? "Billing tables are not installed yet. Run the updated supabase/schema.sql file in Supabase."
          : message
      },
      { status: needsSchema ? 503 : 500 }
    );
  }
}
