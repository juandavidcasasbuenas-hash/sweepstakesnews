import type { Metadata } from "next";
import SeasonMomentumGallery from "@/components/SeasonMomentumGallery";

export const metadata: Metadata = {
  title: "Season Momentum · Sweepstakes News",
  description: "A broadcast-style Match Momentum spoof for every player's season.",
};

export default function MomentumPreviewPage() {
  return (
    <main className="mo-page">
      <SeasonMomentumGallery />
    </main>
  );
}
