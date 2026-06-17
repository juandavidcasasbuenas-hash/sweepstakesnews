import type { Metadata } from "next";
import { notFound } from "next/navigation";
import GoalsAssists from "@/components/GoalsAssists";
import { defaultTournamentSlug, readTournamentBySlug } from "@/lib/tournaments";

type TournamentGoalsAssistsPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: TournamentGoalsAssistsPageProps): Promise<Metadata> {
  const { slug } = await params;
  const tournament = await readTournamentBySlug(slug).catch(() => null);
  if (!tournament) return { title: "Tournament not found" };

  return {
    title: `Goals & Assists · ${tournament.name}`,
    description: `Cached World Cup 2026 leading scorers and assists for ${tournament.name}.`,
  };
}

export default async function TournamentGoalsAssistsPage({
  params,
}: TournamentGoalsAssistsPageProps) {
  const { slug } = await params;
  const tournament = await readTournamentBySlug(slug).catch(() => null);

  if (!tournament || slug === defaultTournamentSlug) {
    notFound();
  }

  return <GoalsAssists tournament={tournament} />;
}
