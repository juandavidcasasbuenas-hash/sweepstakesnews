import type { Metadata } from "next";
import SweepstakesApp from "@/components/SweepstakesApp";

type FreshPicksPageProps = {
  searchParams: Promise<{ entry?: string; submission?: string }>;
};

export const metadata: Metadata = {
  title: "Fresh Picks · World Cup 2026 Predictions",
  description: "Submit fresh knockout-stage picks while retaining your group-stage points.",
};

export default async function FreshPicksPage({ searchParams }: FreshPicksPageProps) {
  const params = await searchParams;
  const sourceSubmissionId = params.entry ?? params.submission;

  return <SweepstakesApp mode="fresh" sourceSubmissionId={sourceSubmissionId} />;
}
