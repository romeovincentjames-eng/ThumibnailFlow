import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";
import { getEnv } from "@/lib/env";
import { BILLING_PLANS, TOP_UP_PACKS, getStripePriceId } from "@/lib/points";
import { getRepository } from "@/lib/repository";
import { getStripeClient } from "@/lib/stripe";
import type { BillingAccount, BillingPlanKey } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const stripe = getStripeClient();
  const webhookSecret = getEnv("STRIPE_WEBHOOK_SECRET");

  if (!stripe || !webhookSecret) {
    return NextResponse.json({ error: "Stripe webhook is not configured." }, { status: 400 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    const rawBody = await request.text();
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid Stripe webhook." },
      { status: 400 }
    );
  }

  try {
    if (event.type === "checkout.session.completed") {
      await handleCheckoutCompleted(stripe, event.data.object as Stripe.Checkout.Session);
    }

    if (event.type === "invoice.paid") {
      await handleInvoicePaid(stripe, event.data.object as Stripe.Invoice);
    }

    if (event.type === "customer.subscription.updated") {
      await handleSubscriptionUpdated(stripe, event.data.object as Stripe.Subscription);
    }

    if (event.type === "customer.subscription.deleted") {
      await handleSubscriptionDeleted(stripe, event.data.object as Stripe.Subscription);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook handling failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Webhook handler failed." },
      { status: 500 }
    );
  }
}

async function handleCheckoutCompleted(stripe: Stripe, session: Stripe.Checkout.Session) {
  const account = await findAccountForSession(stripe, session);
  if (!account) return;

  await updateAccountFromSession(account, session);

  if (session.mode === "payment") {
    const points = Number(session.metadata?.points ?? 0);
    const pack = TOP_UP_PACKS.find((item) => item.key === session.metadata?.itemKey);
    const creditedPoints = points || pack?.points || 0;

    if (creditedPoints > 0) {
      await getRepository().applyPointsDelta({
        accountId: account.id,
        delta: creditedPoints,
        reason: "stripe_topup",
        reference: `checkout:${session.id}`,
        metadata: {
          checkoutSessionId: session.id,
          itemKey: session.metadata?.itemKey ?? null
        }
      });
    }
  }

  if (session.mode === "subscription" && typeof session.subscription === "string") {
    const subscription = await stripe.subscriptions.retrieve(session.subscription);
    await creditSubscriptionPeriod(stripe, subscription, `checkout:${session.id}`);
  }
}

async function handleInvoicePaid(stripe: Stripe, invoice: Stripe.Invoice) {
  const subscriptionId = getInvoiceSubscriptionId(invoice);
  if (!subscriptionId) return;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  await creditSubscriptionPeriod(stripe, subscription, `invoice:${invoice.id}`);
}

async function handleSubscriptionUpdated(stripe: Stripe, subscription: Stripe.Subscription) {
  const account = await findAccountForSubscription(stripe, subscription);
  if (!account) return;

  const plan = getPlanForSubscription(subscription);
  await getRepository().updateBillingAccount(account.id, {
    stripeSubscriptionId: subscription.id,
    stripeSubscriptionStatus: subscription.status,
    planKey: plan?.key ?? account.planKey
  });
}

async function handleSubscriptionDeleted(stripe: Stripe, subscription: Stripe.Subscription) {
  const account = await findAccountForSubscription(stripe, subscription);
  if (!account) return;

  await getRepository().updateBillingAccount(account.id, {
    stripeSubscriptionId: subscription.id,
    stripeSubscriptionStatus: subscription.status,
    planKey: "free"
  });
}

async function creditSubscriptionPeriod(stripe: Stripe, subscription: Stripe.Subscription, sourceReference: string) {
  const account = await findAccountForSubscription(stripe, subscription);
  const plan = getPlanForSubscription(subscription);
  if (!account || !plan) return;

  const periodStart = getSubscriptionPeriodStart(subscription);
  const reference = `subscription:${subscription.id}:${periodStart}`;

  await getRepository().updateBillingAccount(account.id, {
    stripeSubscriptionId: subscription.id,
    stripeSubscriptionStatus: subscription.status,
    planKey: plan.key
  });

  await getRepository().applyPointsDelta({
    accountId: account.id,
    delta: plan.points,
    reason: "stripe_subscription",
    reference,
    metadata: {
      planKey: plan.key,
      sourceReference,
      subscriptionId: subscription.id,
      periodStart
    }
  });
}

async function findAccountForSession(stripe: Stripe, session: Stripe.Checkout.Session) {
  const repository = getRepository();
  const accountId = session.metadata?.accountId;
  if (accountId) {
    const account = await repository.getBillingAccount(accountId);
    if (account) return account;
  }

  const customerId = getCustomerId(session.customer);
  if (!customerId) return null;
  return findAccountForCustomer(stripe, customerId);
}

async function findAccountForSubscription(stripe: Stripe, subscription: Stripe.Subscription) {
  const repository = getRepository();
  const accountId = subscription.metadata?.accountId;
  if (accountId) {
    const account = await repository.getBillingAccount(accountId);
    if (account) return account;
  }

  const customerId = getCustomerId(subscription.customer);
  if (!customerId) return null;
  return findAccountForCustomer(stripe, customerId);
}

async function findAccountForCustomer(stripe: Stripe, customerId: string) {
  const repository = getRepository();
  const existing = await repository.getBillingAccountByStripeCustomerId(customerId);
  if (existing) return existing;

  const customer = await stripe.customers.retrieve(customerId);
  if (customer.deleted) return null;

  const accountId = customer.metadata?.accountId;
  if (accountId) {
    const account = await repository.getBillingAccount(accountId);
    if (account) {
      return repository.updateBillingAccount(account.id, {
        email: customer.email ?? account.email,
        stripeCustomerId: customer.id
      });
    }
  }

  return null;
}

async function updateAccountFromSession(account: BillingAccount, session: Stripe.Checkout.Session) {
  const customerId = getCustomerId(session.customer);
  await getRepository().updateBillingAccount(account.id, {
    email: session.customer_details?.email ?? account.email,
    stripeCustomerId: customerId ?? account.stripeCustomerId
  });
}

function getPlanForSubscription(subscription: Stripe.Subscription) {
  const priceId = subscription.items.data[0]?.price.id;
  const planByPrice = BILLING_PLANS.find((plan) => getStripePriceId(plan.priceEnv) === priceId);
  if (planByPrice) return planByPrice;

  const planKey = subscription.metadata?.planKey as BillingPlanKey | undefined;
  return BILLING_PLANS.find((plan) => plan.key === planKey) ?? null;
}

function getCustomerId(customer: string | Stripe.Customer | Stripe.DeletedCustomer | null) {
  if (!customer) return null;
  return typeof customer === "string" ? customer : customer.id;
}

function getInvoiceSubscriptionId(invoice: Stripe.Invoice) {
  const anyInvoice = invoice as any;
  if (typeof anyInvoice.subscription === "string") return anyInvoice.subscription;
  if (typeof anyInvoice.parent?.subscription_details?.subscription === "string") {
    return anyInvoice.parent.subscription_details.subscription;
  }
  return null;
}

function getSubscriptionPeriodStart(subscription: Stripe.Subscription) {
  const anySubscription = subscription as any;
  return anySubscription.current_period_start ?? anySubscription.items?.data?.[0]?.current_period_start ?? 0;
}
