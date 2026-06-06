import Link from "next/link";
import { ArrowRight, Mail, MessageSquare, ShieldCheck } from "lucide-react";
import { MarketingFooter, MarketingNav } from "@/components/Marketing";

export default function ContactPage() {
  return (
    <main className="marketing-site">
      <MarketingNav />
      <section className="simple-hero">
        <div className="marketing-inner">
          <span className="section-eyebrow">Contact</span>
          <h1>Bring ThumbnailFlow Batch into your creator workflow.</h1>
          <p>Use this page for inbound requests, implementation questions, and production setup conversations.</p>
        </div>
      </section>
      <section className="marketing-section">
        <div className="marketing-inner contact-grid">
          <article className="contact-panel">
            <Mail aria-hidden="true" size={24} />
            <h2>Email</h2>
            <p>Connect this to your preferred support inbox or CRM when you are ready to publish.</p>
            <a href="mailto:hello@thumbnailflow.example">hello@thumbnailflow.example</a>
          </article>
          <article className="contact-panel">
            <MessageSquare aria-hidden="true" size={24} />
            <h2>Implementation</h2>
            <p>Open the generator locally, test a batch, and connect Supabase when the real project keys are ready.</p>
            <Link href="/generate">
              Launch Generator
              <ArrowRight aria-hidden="true" size={16} />
            </Link>
          </article>
          <article className="contact-panel">
            <ShieldCheck aria-hidden="true" size={24} />
            <h2>Security</h2>
            <p>Secrets live only in local environment files or server-side deployment settings.</p>
          </article>
        </div>
      </section>
      <MarketingFooter />
    </main>
  );
}
