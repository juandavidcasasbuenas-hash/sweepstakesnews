import type { Metadata } from "next";
import { notFound } from "next/navigation";
import TournamentManage from "@/components/TournamentManage";
import { defaultTournamentSlug, readTournamentBySlug } from "@/lib/tournaments";

type TournamentAdminPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: TournamentAdminPageProps): Promise<Metadata> {
  const { slug } = await params;
  const tournament = await readTournamentBySlug(slug).catch(() => null);
  if (!tournament) return { title: "Tournament not found" };

  return {
    title: `Manage ${tournament.name}`,
  };
}

export default async function TournamentAdminPage({ params }: TournamentAdminPageProps) {
  const { slug } = await params;
  const tournament = await readTournamentBySlug(slug).catch(() => null);

  if (!tournament || slug === defaultTournamentSlug) {
    notFound();
  }

  return <TournamentManage tournament={tournament} />;
}
