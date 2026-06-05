import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SweepstakesApp from "@/components/SweepstakesApp";
import { defaultTournamentSlug, readTournamentBySlug } from "@/lib/tournaments";

type TournamentPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: TournamentPageProps): Promise<Metadata> {
  const { slug } = await params;
  const tournament = await readTournamentBySlug(slug).catch(() => null);
  if (!tournament) return { title: "Tournament not found" };

  return {
    title: `${tournament.name} · World Cup 2026 Predictions`,
    description: `Join ${tournament.name} and predict every World Cup 2026 match.`,
  };
}

export default async function TournamentPage({ params }: TournamentPageProps) {
  const { slug } = await params;
  const tournament = await readTournamentBySlug(slug).catch(() => null);

  if (!tournament || slug === defaultTournamentSlug) {
    notFound();
  }

  return <SweepstakesApp tournament={tournament} />;
}
