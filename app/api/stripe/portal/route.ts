import { NextResponse, type NextRequest } from "next/server";
import { getCurrentBillingAccount } from "@/lib/billingSession";
import { getAppBaseUrl, getStripeClient } from "@/lib/stripe";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const stripe = getStripeClient();
  const appUrl = getAppBaseUrl(request);

  if (!stripe) {
    return NextResponse.json({ error: "Stripe is not configured yet." }, { status: 400 });
  }

  const account = await getCurrentBillingAccount();
  if (!account?.stripeCustomerId) {
    return NextResponse.json({ error: "No Stripe customer is connected to this browser yet." }, { status: 400 });
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: account.stripeCustomerId,
    return_url: `${appUrl}/pricing`
  });

  return NextResponse.json({ url: session.url });
}
