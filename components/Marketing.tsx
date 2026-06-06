import Link from "next/link";
import { Layers3, LogOut, User } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/server";

const navItems = [
  { href: "/", label: "Home" },
  { href: "/features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/contact", label: "Contact" }
];

export async function MarketingNav() {
  const user = await getCurrentUser();

  return (
    <header className="marketing-nav">
      <Link href="/" className="marketing-brand">
        <span className="brand-mark">
          <Layers3 aria-hidden="true" size={23} />
        </span>
        <span>ThumbnailFlow Batch</span>
      </Link>
      <nav aria-label="Main navigation">
        {navItems.map((item) => (
          <Link href={item.href} key={item.href}>
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="nav-account-actions">
        {user ? (
          <>
            <Link className="secondary-button compact-button" href="/pricing">
              <User aria-hidden="true" size={16} />
              Account
            </Link>
            <form action="/auth/logout" method="POST">
              <button className="secondary-button compact-button" type="submit">
                <LogOut aria-hidden="true" size={16} />
                Log out
              </button>
            </form>
            <Link className="primary-button nav-cta" href="/generate">
              Launch Generator
            </Link>
          </>
        ) : (
          <>
            <Link className="secondary-button compact-button" href="/login">
              <User aria-hidden="true" size={16} />
              Log in
            </Link>
            <Link className="primary-button nav-cta" href="/login?next=/generate">
              Launch Generator
            </Link>
          </>
        )}
      </div>
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="marketing-footer">
      <div>
        <strong>ThumbnailFlow Batch</strong>
        <span>Batch thumbnail generation for creator workflows.</span>
      </div>
      <Link href="/generate">Open Generator</Link>
    </footer>
  );
}
