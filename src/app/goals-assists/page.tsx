import type { Metadata } from "next";
import GoalsAssists from "@/components/GoalsAssists";

export const metadata: Metadata = {
  title: "Goals & Assists · Sweepstakes News",
  description: "Cached World Cup 2026 leading scorers and assists standings.",
};

export default function GoalsAssistsPage() {
  return <GoalsAssists />;
}
