import { NextResponse, type NextRequest } from "next/server";
import { getOrCreateBillingAccount } from "@/lib/billingSession";
import { getCheckoutItem, getStripePriceId, type CheckoutItemKind } from "@/lib/points";
import { getRepository } from "@/lib/repository";
import { getAppBaseUrl, getStripeClient } from "@/lib/stripe";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const stripe = getStripeClient();
  const appUrl = getAppBaseUrl(request);
  const isFormRequest = isFormContent(request);

  try {
    if (!stripe) {
      return failure("Stripe is not configured yet.", isFormRequest, appUrl);
    }

    const { kind, key } = await parseCheckoutRequest(request);
    const item = getCheckoutItem(kind, key);

    if (!item) {
      return failure("That plan or point pack does not exist.", isFormRequest, appUrl);
    }

    const priceId = getStripePriceId(item.priceEnv);
    if (!priceId) {
      return failure(`Missing Stripe price ID: ${item.priceEnv}.`, isFormRequest, appUrl);
    }

    const repository = getRepository();
    let account = await getOrCreateBillingAccount();

    let customerId = account.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        metadata: {
          accountId: account.id
        }
      });
      customerId = customer.id;
      account = await repository.updateBillingAccount(account.id, {
        stripeCustomerId: customer.id
      }) ?? account;
    }

    const session = await stripe.checkout.sessions.create({
      mode: kind === "plan" ? "subscription" : "payment",
      customer: customerId,
      line_items: [
        {
          price: priceId,
          quantity: 1
        }
      ],
      allow_promotion_codes: true,
      metadata: {
        accountId: account.id,
        itemKind: kind,
        itemKey: item.key,
        points: String(item.points)
      },
      subscription_data:
        kind === "plan"
          ? {
              metadata: {
                accountId: account.id,
                planKey: item.key,
                points: String(item.points)
              }
            }
          : undefined,
      success_url: `${appUrl}/pricing?checkout=success`,
      cancel_url: `${appUrl}/pricing?checkout=cancelled`
    });

    if (!session.url) {
      return failure("Stripe did not return a checkout URL.", isFormRequest, appUrl);
    }

    if (isFormRequest) {
      return NextResponse.redirect(session.url, { status: 303 });
    }

    return NextResponse.json({ url: session.url });
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Could not start checkout.", isFormRequest, appUrl);
  }
}

async function parseCheckoutRequest(request: NextRequest): Promise<{ kind: CheckoutItemKind; key: string }> {
  if (isFormContent(request)) {
    const formData = await request.formData();
    return {
      kind: formData.get("kind") === "topup" ? "topup" : "plan",
      key: String(formData.get("key") ?? "")
    };
  }

  const body = await request.json();
  return {
    kind: body.kind === "topup" ? "topup" : "plan",
    key: String(body.key ?? "")
  };
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
