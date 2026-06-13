import { NextResponse, type NextRequest } from "next/server";
import { getCurrentBillingAccount } from "@/lib/billingSession";
import { getAppBaseUrl, getStripeClient } from "@/lib/stripe";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const stripe = getStripeClient();
  const appUrl = getAppBaseUrl(request);
  const isFormRequest = isFormContent(request);

  if (!stripe) {
    return failure("Stripe is not configured yet.", isFormRequest, appUrl);
  }

  const account = await getCurrentBillingAccount();
  if (!account?.stripeCustomerId) {
    return failure("No Stripe customer is connected to this browser yet.", isFormRequest, appUrl);
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: account.stripeCustomerId,
    return_url: `${appUrl}/pricing`
  });

  if (isFormRequest) {
    return NextResponse.redirect(session.url, { status: 303 });
  }

  return NextResponse.json({ url: session.url });
}

function isFormContent(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";
  return contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data");
}

function failure(message: string, isFormRequest: boolean, appUrl: string) {
  if (isFormRequest) {
    return NextResponse.redirect(`${appUrl}/pricing?checkout=error&message=${encodeURIComponent(message)}`, {
      status: 303
    });
  }

  return NextResponse.json({ error: message }, { status: 400 });
}
