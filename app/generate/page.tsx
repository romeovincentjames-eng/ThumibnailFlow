import { BatchCreator } from "@/components/BatchCreator";
import { MarketingFooter, MarketingNav } from "@/components/Marketing";

export default function GeneratePage() {
  return (
    <main className="marketing-site generator-site">
      <MarketingNav />
      <BatchCreator />
      <MarketingFooter />
    </main>
  );
}
