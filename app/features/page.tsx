import Link from "next/link";
import { ArrowRight, Database, Images, RefreshCcw, UploadCloud, WandSparkles } from "lucide-react";
import { MarketingFooter, MarketingNav } from "@/components/Marketing";

const features = [
  {
    icon: <UploadCloud size={22} />,
    title: "YouTube Links And Uploads",
    text: "Batch up to 10 YouTube URLs or uploaded source videos, with manual transcript, notes, and metadata fields."
  },
  {
    icon: <WandSparkles size={22} />,
    title: "Title Generator And Copy",
    text: "Generate multiple clickable title ideas, a primary title, description, hashtags, and thumbnail prompt for each source."
  },
  {
    icon: <Images size={22} />,
    title: "Multiple Concepts",
    text: "Choose global thumbnail counts and override individual sources when one thumbnail needs more variations."
  },
  {
    icon: <RefreshCcw size={22} />,
    title: "Regeneration Controls",
    text: "Regenerate a single thumbnail image, one concept, or every concept for a source without restarting the whole batch."
  },
  {
    icon: <Database size={22} />,
    title: "Storage Ready",
    text: "Save image files to Supabase Storage and thumbnail metadata to Supabase tables when keys are configured."
  }
];

export default function FeaturesPage() {
  return (
    <main className="marketing-site">
      <MarketingNav />
      <section className="simple-hero">
        <div className="marketing-inner">
          <span className="section-eyebrow">Features</span>
          <h1>Everything the thumbnail workflow needs in one website.</h1>
          <p>ThumbnailFlow Batch keeps the creative steps, output formats, and production status together.</p>
        </div>
      </section>
      <section className="marketing-section">
        <div className="marketing-inner feature-grid-large">
          {features.map((feature) => (
            <article className="feature-summary feature-summary-large" key={feature.title}>
              <div className="feature-icon">{feature.icon}</div>
              <h2>{feature.title}</h2>
              <p>{feature.text}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="cta-band">
        <div className="marketing-inner cta-inner">
          <h2>Use the live generator with your current batch setup.</h2>
          <Link className="primary-button" href="/generate">
            Launch Generator
            <ArrowRight aria-hidden="true" size={18} />
          </Link>
        </div>
      </section>
      <MarketingFooter />
    </main>
  );
}
