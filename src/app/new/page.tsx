import type { Metadata } from "next";
import CreateTournament from "@/components/CreateTournament";

export const metadata: Metadata = {
  title: "Create Tournament · World Cup 2026 Predictions",
  description: "Create a shareable World Cup 2026 prediction tournament.",
};

export default function NewTournamentPage() {
  return <CreateTournament />;
}
