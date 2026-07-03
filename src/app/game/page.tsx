import type { Metadata } from "next";
import AdministratorGame from "@/components/game/AdministratorGame";

export const metadata: Metadata = {
  title: "Sweepstakes News Administrator · The Game",
  description:
    "Survive six group-chat crises as the Sweepstakes Administrator. Rule fast, keep the trust, don't let the chat boil over.",
};

export default function GamePage() {
  return (
    <main className="adm-page">
      <AdministratorGame />
    </main>
  );
}
