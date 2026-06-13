import Link from "next/link";
import { ArrowRight, Check, CreditCard } from "lucide-react";
import { MarketingFooter, MarketingNav } from "@/components/Marketing";
import { getCurrentUser } from "@/lib/auth/server";
import { getOrCreateBillingAccount } from "@/lib/billingSession";
import { isUnlimitedBillingAccount } from "@/lib/billingOverrides";
import { hasStripeConfig } from "@/lib/env";
import {
  BILLING_PLANS,
  POINT_COSTS,
  POINT_COST_RANGES,
  TOP_UP_PACKS,
  estimateVideoPoints,
  getStripePriceId
} from "@/lib/points";

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
  const stripeSecretConfigured = hasStripeConfig();
  const hasUnlimitedCredits = Boolean(billing?.account && isUnlimitedBillingAccount(billing.account));
  const oneVideoExample = estimateVideoPoints({ thumbnailCount: 1, formatCount: 4 });
  const threeConceptExample = estimateVideoPoints({ thumbnailCount: 3, formatCount: 4 });

  return (
    <main className="marketing-site">
      <MarketingNav />
      <section className="simple-hero">
        <div className="marketing-inner">
          <span className="section-eyebrow">Pricing</span>
          <h1>Point packs for thumbnail production.</h1>
          <p>
            Start with 20 trial points, then use monthly credits or top-ups to generate title ideas,
            copy, thumbnails, and YouTube publishing actions.
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
                <h2>
                  {billing?.account
                    ? hasUnlimitedCredits
                      ? "Unlimited credits"
                      : `${billing.account.pointsBalance.toLocaleString()} points`
                    : "Account pending"}
                </h2>
                <p>
                  {billing?.account
                    ? hasUnlimitedCredits
                      ? `Plan: Agency. Owner credits are tied to ${user?.email}.`
                      : `Plan: ${billing.account.planKey}. Credits are tied to ${user?.email}.`
                    : "Run the billing schema in Supabase to activate account balances."}
                </p>
                {billing?.account?.stripeCustomerId && stripeSecretConfigured ? (
                  <form action="/api/stripe/portal" method="POST">
                    <button className="secondary-button" type="submit">
                      Manage billing
                      <CreditCard aria-hidden="true" size={17} />
                    </button>
                  </form>
                ) : null}
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
          <article className="pricing-rules-card pricing-rules-card-wide">
            <span className="section-eyebrow">Point System</span>
            <h2>Credit costs by action</h2>
            <table className="pricing-rules-table">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Points</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Analyze YouTube link</td>
                  <td>{POINT_COSTS.analyzeYouTubeLink} points</td>
                </tr>
                <tr>
                  <td>Generate title ideas and thumbnail prompt</td>
                  <td>{POINT_COSTS.thumbnailPrompt} points</td>
                </tr>
                <tr>
                  <td>Generate 1 AI thumbnail</td>
                  <td>
                    {POINT_COST_RANGES.thumbnailImage.min}-{POINT_COST_RANGES.thumbnailImage.max} points
                    <span>{POINT_COSTS.thumbnailImage} today</span>
                  </td>
                </tr>
                <tr>
                  <td>Regenerate thumbnail</td>
                  <td>
                    {POINT_COST_RANGES.thumbnailRegeneration.min}-{POINT_COST_RANGES.thumbnailRegeneration.max} points
                    <span>{POINT_COSTS.thumbnailRegeneration} today</span>
                  </td>
                </tr>
                <tr>
                  <td>Create 3 formats</td>
                  <td>
                    {POINT_COST_RANGES.threeFormatSet.min}-{POINT_COST_RANGES.threeFormatSet.max} points
                    <span>{POINT_COSTS.threeFormatSet} today</span>
                  </td>
                </tr>
                <tr>
                  <td>Apply thumbnail to YouTube</td>
                  <td>
                    {POINT_COST_RANGES.youtubeApply.min}-{POINT_COST_RANGES.youtubeApply.max} points
                    <span>{POINT_COSTS.youtubeApply} today</span>
                  </td>
                </tr>
                <tr>
                  <td>Full batch for 1 video</td>
                  <td>
                    {POINT_COST_RANGES.fullBatchPerVideo.min}-{POINT_COST_RANGES.fullBatchPerVideo.max} points
                    <span>{oneVideoExample} typical</span>
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="pricing-refund-note">
              Failed generation steps refund unused reserved points automatically.
            </p>
          </article>
          <article className="pricing-rules-card">
            <span className="section-eyebrow">Example</span>
            <h2>3 concepts × 4 formats</h2>
            <p>
              One video with three thumbnail concepts and every format uses {threeConceptExample} points:
              {POINT_COSTS.creativePackPerVideo} for analysis and prompt work, then {POINT_COSTS.thumbnailImage}
              plus {POINT_COSTS.threeFormatSet} format points per concept.
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
                  itemName={plan.name}
                  points={plan.points}
                  featured={Boolean(plan.featured)}
                  setupMessage={getStripeSetupMessage({
                    stripeSecretConfigured,
                    priceConfigured: Boolean(getStripePriceId(plan.priceEnv)),
                    priceEnv: plan.priceEnv
                  })}
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
                  itemName={pack.name}
                  points={pack.points}
                  setupMessage={getStripeSetupMessage({
                    stripeSecretConfigured,
                    priceConfigured: Boolean(getStripePriceId(pack.priceEnv)),
                    priceEnv: pack.priceEnv
                  })}
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
  itemName,
  points,
  featured,
  setupMessage,
  isLoggedIn
}: {
  kind: "plan" | "topup";
  itemKey: string;
  itemName: string;
  points: number;
  featured?: boolean;
  setupMessage: string | null;
  isLoggedIn: boolean;
}) {
  const purchaseLabel = kind === "plan" ? `Subscribe to ${itemName}` : `Buy ${points.toLocaleString()} points`;
  const loginLabel = kind === "plan" ? "Log in to subscribe" : "Log in to buy points";

  if (!isLoggedIn) {
    return (
      <Link className={featured ? "primary-button" : "secondary-button"} href="/login?next=/pricing">
        {loginLabel}
        <ArrowRight aria-hidden="true" size={17} />
      </Link>
    );
  }

  return (
    <>
      <form action="/api/stripe/checkout" method="POST">
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="key" value={itemKey} />
        <button className={featured ? "primary-button" : "secondary-button"} disabled={Boolean(setupMessage)} type="submit">
          {purchaseLabel}
          <ArrowRight aria-hidden="true" size={17} />
        </button>
      </form>
      {setupMessage ? <p className="pricing-admin-note">{setupMessage}</p> : null}
    </>
  );
}

function getStripeSetupMessage({
  stripeSecretConfigured,
  priceConfigured,
  priceEnv
}: {
  stripeSecretConfigured: boolean;
  priceConfigured: boolean;
  priceEnv: string;
}) {
  if (!stripeSecretConfigured) {
    return "Admin setup needed: Stripe payments are not connected.";
  }

  if (!priceConfigured) {
    return `Admin setup needed: add ${priceEnv}.`;
  }

  return null;
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
