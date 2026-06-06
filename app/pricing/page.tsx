import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { MarketingFooter, MarketingNav } from "@/components/Marketing";
import { getCurrentUser } from "@/lib/auth/server";
import { getOrCreateBillingAccount } from "@/lib/billingSession";
import { BILLING_PLANS, POINT_COSTS, TOP_UP_PACKS, getStripePriceId } from "@/lib/points";

type PricingPageProps = {
  searchParams?: {
    checkout?: string;
    message?: string;
  };
};

export const dynamic = "force-dynamic";

export default async function PricingPage({ searchParams }: PricingPageProps) {
  const checkoutState = searchParams?.checkout;
  const user = await getCurrentUser();
  const billing = user ? await getBillingAccountSnapshot() : null;
  const isLoggedIn = Boolean(user);

  return (
    <main className="marketing-site">
      <MarketingNav />
      <section className="simple-hero">
        <div className="marketing-inner">
          <span className="section-eyebrow">Pricing</span>
          <h1>Point packs for thumbnail production.</h1>
          <p>
            Start with 20 trial points, then use monthly credits or top-ups to generate copy,
            thumbnails, and YouTube publishing actions.
          </p>
          {checkoutState ? (
            <div className={checkoutState === "success" ? "notice-box" : "error-box"}>
              {getCheckoutMessage(checkoutState, searchParams?.message)}
            </div>
          ) : null}
          {billing?.error ? <div className="error-box">{billing.error}</div> : null}
        </div>
      </section>

      <section className="marketing-section pricing-section">
        <div className="marketing-inner pricing-intro-grid">
          <article className="pricing-rules-card account-summary-card">
            <span className="section-eyebrow">Your Account</span>
            {isLoggedIn ? (
              <>
                <h2>{billing?.account ? `${billing.account.pointsBalance.toLocaleString()} points` : "Account pending"}</h2>
                <p>
                  {billing?.account
                    ? `Plan: ${billing.account.planKey}. Credits are tied to ${user?.email}.`
                    : "Run the billing schema in Supabase to activate account balances."}
                </p>
              </>
            ) : (
              <>
                <h2>Log in to buy credits.</h2>
                <p>Create an account so points, batches, YouTube publishing, and top-ups stay with you.</p>
                <Link className="primary-button" href="/login?next=/pricing">
                  Log in
                  <ArrowRight aria-hidden="true" size={17} />
                </Link>
              </>
            )}
          </article>
          <article className="pricing-rules-card">
            <span className="section-eyebrow">Point System</span>
            <h2>Simple usage pricing</h2>
            <ul>
              <li>
                <Check aria-hidden="true" size={16} />
                {POINT_COSTS.thumbnailImage} points per generated thumbnail image
              </li>
              <li>
                <Check aria-hidden="true" size={16} />
                {POINT_COSTS.creativePackPerVideo} points per AI title, description, hashtags, and prompt
              </li>
              <li>
                <Check aria-hidden="true" size={16} />
                {POINT_COSTS.youtubeApply} points to apply title, description, and thumbnail to YouTube
              </li>
              <li>
                <Check aria-hidden="true" size={16} />
                Failed generation steps refund unused reserved points
              </li>
            </ul>
          </article>
          <article className="pricing-rules-card">
            <span className="section-eyebrow">Example</span>
            <h2>3 concepts × 4 formats</h2>
            <p>
              One video with 12 generated images uses 120 image points plus 2 copy points,
              for a total of 122 points.
            </p>
          </article>
        </div>
      </section>

      <section className="marketing-section">
        <div className="marketing-inner">
          <div className="section-heading-row">
            <div>
              <span className="section-eyebrow">Monthly Plans</span>
              <h2>Subscribe for recurring points.</h2>
            </div>
          </div>
          <div className="pricing-grid">
            {BILLING_PLANS.map((plan) => (
              <article className={plan.featured ? "pricing-card pricing-card-featured" : "pricing-card"} key={plan.key}>
                <h2>{plan.name}</h2>
                <strong>{plan.price}</strong>
                <p>{plan.description}</p>
                <ul>
                  <li>
                    <Check aria-hidden="true" size={16} />
                    {plan.points.toLocaleString()} points per month
                  </li>
                  <li>
                    <Check aria-hidden="true" size={16} />
                    Batch generation paywall included
                  </li>
                  <li>
                    <Check aria-hidden="true" size={16} />
                    Regeneration and YouTube Apply point-gated
                  </li>
                </ul>
                <CheckoutButton
                  kind="plan"
                  itemKey={plan.key}
                  featured={Boolean(plan.featured)}
                  configured={Boolean(getStripePriceId(plan.priceEnv))}
                  isLoggedIn={isLoggedIn}
                />
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="marketing-section">
        <div className="marketing-inner">
          <div className="section-heading-row">
            <div>
              <span className="section-eyebrow">Top-Ups</span>
              <h2>Add points without changing plan.</h2>
            </div>
          </div>
          <div className="topup-grid">
            {TOP_UP_PACKS.map((pack) => (
              <article className="pricing-card topup-card" key={pack.key}>
                <h2>{pack.name}</h2>
                <strong>{pack.price}</strong>
                <p>One-time points for extra batches or heavier format sets.</p>
                <CheckoutButton
                  kind="topup"
                  itemKey={pack.key}
                  configured={Boolean(getStripePriceId(pack.priceEnv))}
                  isLoggedIn={isLoggedIn}
                />
              </article>
            ))}
          </div>
        </div>
      </section>
      <MarketingFooter />
    </main>
  );
}

function CheckoutButton({
  kind,
  itemKey,
  featured,
  configured,
  isLoggedIn
}: {
  kind: "plan" | "topup";
  itemKey: string;
  featured?: boolean;
  configured: boolean;
  isLoggedIn: boolean;
}) {
  if (!isLoggedIn) {
    return (
      <Link className={featured ? "primary-button" : "secondary-button"} href="/login?next=/pricing">
        Log in to buy
        <ArrowRight aria-hidden="true" size={17} />
      </Link>
    );
  }

  return (
    <form action="/api/stripe/checkout" method="POST">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="key" value={itemKey} />
      <button className={featured ? "primary-button" : "secondary-button"} disabled={!configured} type="submit">
        {configured ? "Checkout" : "Add Stripe price ID"}
        <ArrowRight aria-hidden="true" size={17} />
      </button>
    </form>
  );
}

async function getBillingAccountSnapshot() {
  try {
    return {
      account: await getOrCreateBillingAccount(),
      error: null
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load billing account.";
    const needsSchema = /billing_accounts|point_ledger|schema cache|PGRST205/i.test(message);

    return {
      account: null,
      error: needsSchema
        ? "Billing tables are not installed yet. Run the updated supabase/schema.sql file in Supabase."
        : message
    };
  }
}

function getCheckoutMessage(state: string, message?: string) {
  if (state === "success") {
    return "Checkout complete. If points do not appear immediately, make sure the Stripe webhook is running.";
  }

  if (state === "cancelled") {
    return "Checkout was cancelled. No points were added.";
  }

  return message ? decodeURIComponent(message) : "Checkout could not start.";
}
