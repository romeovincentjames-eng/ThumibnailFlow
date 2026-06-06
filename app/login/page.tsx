import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { MarketingFooter, MarketingNav } from "@/components/Marketing";
import { getCurrentUser } from "@/lib/auth/server";

type LoginPageProps = {
  searchParams?: {
    next?: string;
  };
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const user = await getCurrentUser();
  const nextPath = sanitizeNextPath(searchParams?.next);

  if (user) {
    redirect(nextPath);
  }

  return (
    <main className="marketing-site auth-page">
      <MarketingNav />
      <section className="auth-section">
        <div className="marketing-inner auth-grid">
          <div className="auth-copy">
            <span className="section-eyebrow">Account Required</span>
            <h1>Log in to generate and buy credits.</h1>
            <p>
              Your points, Stripe purchases, generated batches, YouTube publishing, and future clipping
              analyzer access are tied to your account.
            </p>
          </div>
          <AuthForm nextPath={nextPath} />
        </div>
      </section>
      <MarketingFooter />
    </main>
  );
}

function sanitizeNextPath(value?: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/generate";
  return value;
}
