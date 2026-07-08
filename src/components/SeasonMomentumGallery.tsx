"use client";

// Standalone dark preview page for the SEASON MOMENTUM spoof. Thin wrapper
// around the shared board; the Fun Facts panel uses the same board with cream
// chrome. Kept as a full-bleed review page.

import SeasonMomentumBoard from "@/components/SeasonMomentumBoard";

export default function SeasonMomentumGallery() {
  return (
    <div className="mo-gallery">
      <header className="mo-gallery-head">
        <h1>Season Momentum</h1>
      </header>
      <SeasonMomentumBoard />
    </div>
  );
}
