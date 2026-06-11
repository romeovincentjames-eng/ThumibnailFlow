import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, BadgeCheck, Images, LineChart, Sparkles, UploadCloud } from "lucide-react";
import { MarketingFooter, MarketingNav } from "@/components/Marketing";

const heroStats = [
  { label: "Max sources", value: "10" },
  { label: "Thumbnail concepts", value: "1-10" },
  { label: "Output crops", value: "4" }
];

const workflow = [
  "Paste YouTube links or upload source files",
  "Add notes, transcripts, and optional references",
  "Generate thumbnail concepts across every selected format",
  "Review, save, download, or regenerate"
];

export default function HomePage() {
  return (
    <main className="marketing-site">
      <MarketingNav />
      <section className="hero-section">
        <Image
          className="hero-image"
          src="/landing/thumbnailflow-hero.png"
          alt="Creator workstation with thumbnail layouts and generation progress"
          fill
          priority
          sizes="100vw"
        />
        <div className="hero-shade" />
        <div className="hero-content">
          <span className="hero-kicker">
            <Sparkles aria-hidden="true" size={17} />
            AI thumbnail production for creator teams
          </span>
          <h1>ThumbnailFlow Batch</h1>
          <p>
            Turn YouTube links, transcripts, or uploaded source videos into complete thumbnail image packages with title ideas,
            descriptions, prompts, concepts, crops, storage, and progress tracking.
          </p>
          <div className="hero-actions">
            <Link className="primary-button" href="/generate">
              Launch Generator
              <ArrowRight aria-hidden="true" size={18} />
            </Link>
            <Link className="secondary-button marketing-secondary" href="/features">
              View Features
            </Link>
          </div>
          <div className="hero-stats">
            {heroStats.map((stat) => (
              <div key={stat.label}>
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="marketing-band">
        <div className="marketing-inner split-layout">
          <div>
            <span className="section-eyebrow">Batch Workflow</span>
            <h2>One focused flow from source video to finished thumbnail set.</h2>
          </div>
          <div className="workflow-list">
            {workflow.map((item, index) => (
              <div className="workflow-item" key={item}>
                <span>{index + 1}</span>
                <p>{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="marketing-section">
        <div className="marketing-inner">
          <div className="section-heading">
            <span className="section-eyebrow">Built For Output</span>
            <h2>Generate the assets around the thumbnail, not only the image.</h2>
          </div>
          <div className="feature-row">
            <FeatureSummary icon={<Images size={22} />} title="Concepts and Crops" text="Choose 1, 2, 3, 5, or 10 thumbnail concepts per source, then render each one in 16:9, 1:1, 9:16, and 4:5." />
            <FeatureSummary icon={<UploadCloud size={22} />} title="Links or Uploads" text="Use YouTube URLs for metadata extraction or upload local video files only as source context for thumbnail images." />
            <FeatureSummary icon={<Sparkles size={22} />} title="Title Generator" text="Generate multiple clickable title ideas for every source or YouTube link in the batch, then use the primary title for publishing." />
            <FeatureSummary icon={<LineChart size={22} />} title="Progress You Can Trust" text="Track total images requested and completed while each source moves through analysis, prompt generation, and thumbnail rendering." />
          </div>
        </div>
      </section>

      <section className="cta-band">
        <div className="marketing-inner cta-inner">
          <div>
            <span className="section-eyebrow">Ready</span>
            <h2>Open the generator and start a real batch.</h2>
          </div>
          <Link className="primary-button" href="/generate">
            Generate Batch
            <ArrowRight aria-hidden="true" size={18} />
          </Link>
        </div>
      </section>
      <MarketingFooter />
    </main>
  );
}

function FeatureSummary({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <article className="feature-summary">
      <div className="feature-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{text}</p>
      <BadgeCheck aria-hidden="true" size={18} />
    </article>
  );
}
