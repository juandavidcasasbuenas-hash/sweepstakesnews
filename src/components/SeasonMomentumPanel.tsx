"use client";

// Fun Facts embed of the SEASON MOMENTUM spoof. Wraps the shared board in the
// tabloid panel chrome (SectionTitle + cream-skinned controls) so it sits
// seamlessly among the other insight panels.

import { Activity } from "lucide-react";
import SeasonMomentumBoard from "@/components/SeasonMomentumBoard";

export default function SeasonMomentumPanel() {
  return (
    <section className="panel ins-momentum">
      <div className="section-title">
        <span className="title-icon">
          <Activity size={18} />
        </span>
        <div>
          <span className="eyebrow">Broadcast graphics, but make it petty</span>
          <h2>Season Momentum</h2>
        </div>
      </div>
      <p className="ins-note ins-note-lead">
        The telly’s “Match Momentum” swing-o-meter, spoofed for the whole season.
        Pick any player and any opponent: the wave rises into their half every
        checkpoint they out-scored the other, and dips when they didn’t.
      </p>
      <SeasonMomentumBoard />
    </section>
  );
}
