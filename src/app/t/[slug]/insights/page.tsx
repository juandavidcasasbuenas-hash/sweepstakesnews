import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PredictionInsights from "@/components/PredictionInsights";
import { defaultTournamentSlug, readTournamentBySlug } from "@/lib/tournaments";

type TournamentInsightsPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: TournamentInsightsPageProps): Promise<Metadata> {
  const { slug } = await params;
  const tournament = await readTournamentBySlug(slug).catch(() => null);
  if (!tournament) return { title: "Tournament not found" };

  return {
    title: `Fun Facts · ${tournament.name}`,
    description: `Playful stats and hot takes pulled from everyone's predictions in ${tournament.name}.`,
  };
}

export default async function TournamentInsightsPage({ params }: TournamentInsightsPageProps) {
  const { slug } = await params;
  const tournament = await readTournamentBySlug(slug).catch(() => null);

  if (!tournament || slug === defaultTournamentSlug) {
    notFound();
  }

  return <PredictionInsights tournament={tournament} />;
}
