"use client";

import { ArrowRight, ClipboardCheck, Link2, Trophy } from "lucide-react";
import Image from "next/image";
import { useMemo, useState } from "react";
import type { Tournament } from "@/types/game";

type CreateTournamentPayload = {
  tournament?: Tournament;
  adminToken?: string;
  error?: string;
};

export default function CreateTournament() {
  const [name, setName] = useState("");
  const [creatorName, setCreatorName] = useState("");
  const [created, setCreated] = useState<CreateTournamentPayload | null>(null);
  const [status, setStatus] = useState("");
  const [creating, setCreating] = useState(false);

  const links = useMemo(() => {
    if (typeof window === "undefined" || !created?.tournament) return null;
    const origin = window.location.origin;
    const playUrl = `${origin}/t/${created.tournament.slug}`;
    const adminUrl = `${playUrl}/admin?token=${encodeURIComponent(created.adminToken ?? "")}`;
    return { playUrl, adminUrl };
  }, [created]);

  async function createTournament() {
    const tournamentName = name.trim();
    if (!tournamentName) {
      setStatus("Name your tournament first.");
      return;
    }

    setCreating(true);
    setStatus("");
    setCreated(null);
    try {
      const response = await fetch("/api/tournaments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: tournamentName,
          creatorName: creatorName.trim() || undefined,
        }),
      });
      const payload = (await response.json()) as CreateTournamentPayload;
      if (!response.ok || !payload.tournament) {
        throw new Error(payload.error ?? "Could not create tournament");
      }
      window.localStorage.setItem(
        `sweepstakes-news-admin-token:${payload.tournament.slug}`,
        payload.adminToken ?? "",
      );
      setCreated(payload);
      setStatus("Tournament created.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not create tournament");
    } finally {
      setCreating(false);
    }
  }

  async function copyLink(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setStatus(`${label} copied.`);
    } catch {
      setStatus(value);
    }
  }

  return (
    <main className="create-page">
      <section className="create-hero">
        <Image
          src="/tournament-generic-banner.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="create-hero-image"
        />
        <div className="create-hero-overlay" />
        <div className="create-hero-content">
          <span className="eyebrow">World Cup 2026 prediction pool</span>
          <h1>Create your tournament</h1>
          <p>
            Name a private table, send the link around, and let everyone make
            their predictions against the same live World Cup results.
          </p>
        </div>
      </section>

      <section className="create-body">
        <div className="create-form panel">
          <div className="form-heading">
            <Trophy size={22} />
            <div>
              <span className="eyebrow">New tournament</span>
              <h2>Set up the table</h2>
            </div>
          </div>

          <label className="field-label">
            Tournament name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Office World Cup pool"
              maxLength={80}
            />
          </label>

          <label className="field-label">
            Your name
            <input
              value={creatorName}
              onChange={(event) => setCreatorName(event.target.value)}
              placeholder="Optional"
              maxLength={60}
            />
          </label>

          <button className="primary-button icon-button" onClick={createTournament} disabled={creating}>
            <ArrowRight size={16} />
            {creating ? "Creating..." : "Create tournament"}
          </button>

          {status ? <p className="form-status">{status}</p> : null}
        </div>

        {created?.tournament && links ? (
          <div className="create-form panel">
            <div className="form-heading">
              <Link2 size={22} />
              <div>
                <span className="eyebrow">Ready to share</span>
                <h2>{created.tournament.name}</h2>
              </div>
            </div>

            <div className="share-row">
              <span>Invite link</span>
              <button className="secondary-button icon-button" onClick={() => copyLink(links.playUrl, "Invite link")}>
                <ClipboardCheck size={16} />
                Copy
              </button>
            </div>
            <code className="share-url">{links.playUrl}</code>

            <div className="share-row">
              <span>Manage link</span>
              <button className="secondary-button icon-button" onClick={() => copyLink(links.adminUrl, "Manage link")}>
                <ClipboardCheck size={16} />
                Copy
              </button>
            </div>
            <code className="share-url">{links.adminUrl}</code>

            <a className="primary-button icon-button visit-link" href={`/t/${created.tournament.slug}`}>
              <ArrowRight size={16} />
              Open tournament
            </a>
          </div>
        ) : null}
      </section>
    </main>
  );
}
