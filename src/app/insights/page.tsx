import type { Metadata } from "next";
import PredictionInsights from "@/components/PredictionInsights";

export const metadata: Metadata = {
  title: "Fun Facts · Sweepstakes News",
  description: "Playful stats and hot takes pulled from everyone's World Cup 2026 predictions.",
};

export default function InsightsPage() {
  return <PredictionInsights />;
}
