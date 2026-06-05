"use client";

import { ClipboardCheck, Link2, UsersRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Submission, Tournament } from "@/types/game";

type SubmissionsPayload = {
  submissions?: Submission[];
  error?: string;
};

export default function TournamentManage({ tournament }: { tournament: Tournament }) {
  const [tokenStored, setTokenStored] = useState(false);
  const [status, setStatus] = useState("");
  const [submissions, setSubmissions] = useState<Submission[]>([]);

  const links = useMemo(() => {
    if (typeof window === "undefined") return null;
    const playUrl = `${window.location.origin}/t/${tournament.slug}`;
    return { playUrl };
  }, [tournament.slug]);

  useEffect(() => {
    queueMicrotask(() => {
      const params = new URLSearchParams(window.location.search);
      const token = params.get("token");
      const key = `sweepstakes-news-admin-token:${tournament.slug}`;
      if (token) {
        window.localStorage.setItem(key, token);
        window.history.replaceState(null, "", `/t/${tournament.slug}/admin`);
        setTokenStored(true);
        setStatus("Creator access saved in this browser.");
        return;
      }
      setTokenStored(Boolean(window.localStorage.getItem(key)));
    });
  }, [tournament.slug]);

  useEffect(() => {
    fetch(`/api/submissions?tournament=${encodeURIComponent(tournament.slug)}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: SubmissionsPayload) => {
        if (payload.submissions) setSubmissions(payload.submissions);
      })
      .catch(() => undefined);
  }, [tournament.slug]);

  async function copyInvite() {
    if (!links) return;
    try {
      await navigator.clipboard.writeText(links.playUrl);
      setStatus("Invite link copied.");
    } catch {
      setStatus(links.playUrl);
    }
  }

  return (
    <main className="admin-page tournament-manage-page">
      <section className="admin-hero">
        <span className="eyebrow">Creator area</span>
        <h1>{tournament.name}</h1>
      </section>

      <section className="admin-stats">
        <article>
          <UsersRound size={18} />
          <span>Entries</span>
          <strong>{submissions.length}</strong>
        </article>
        <article>
          <Link2 size={18} />
          <span>Creator access</span>
          <strong>{tokenStored ? "Saved" : "Missing"}</strong>
        </article>
      </section>

      <section className="admin-token-panel">
        <div>
          <span className="eyebrow">Invite friends</span>
          <h2>Share the tournament link</h2>
        </div>
        {links ? <code className="share-url">{links.playUrl}</code> : null}
        <button className="primary-button icon-button" onClick={copyInvite}>
          <ClipboardCheck size={16} />
          Copy invite link
        </button>
        {status ? <p className="form-status">{status}</p> : null}
      </section>
    </main>
  );
}
