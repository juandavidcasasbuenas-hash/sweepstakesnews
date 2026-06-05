"use client";

import { ClipboardCheck, Link2, Save, Trash2, UsersRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Submission, Tournament } from "@/types/game";

type SubmissionsPayload = {
  submissions?: Submission[];
  error?: string;
};

type TournamentPayload = {
  tournament?: Tournament;
  error?: string;
};

function formatDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unknown date";
  return date.toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function TournamentManage({ tournament }: { tournament: Tournament }) {
  const [adminToken, setAdminToken] = useState("");
  const [tournamentName, setTournamentName] = useState(tournament.name);
  const [nameDraft, setNameDraft] = useState(tournament.name);
  const [status, setStatus] = useState("");
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [savingName, setSavingName] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  const links = useMemo(() => {
    if (typeof window === "undefined") return null;
    const playUrl = `${window.location.origin}/t/${tournament.slug}`;
    return { playUrl };
  }, [tournament.slug]);
  const hasCreatorAccess = Boolean(adminToken);

  useEffect(() => {
    queueMicrotask(() => {
      const params = new URLSearchParams(window.location.search);
      const token = params.get("token");
      const key = `sweepstakes-news-admin-token:${tournament.slug}`;
      if (token) {
        window.localStorage.setItem(key, token);
        window.history.replaceState(null, "", `/t/${tournament.slug}/admin`);
        setAdminToken(token);
        setStatus("Creator access saved in this browser.");
        return;
      }
      setAdminToken(window.localStorage.getItem(key) ?? "");
    });
  }, [tournament.slug]);

  const loadSubmissions = useCallback(async () => {
    return fetch(`/api/submissions?tournament=${encodeURIComponent(tournament.slug)}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: SubmissionsPayload) => {
        if (payload.submissions) setSubmissions(payload.submissions);
      })
      .catch(() => undefined);
  }, [tournament.slug]);

  useEffect(() => {
    void loadSubmissions();
  }, [loadSubmissions]);

  useEffect(() => {
    if (!confirmingDeleteId) return;
    const reset = window.setTimeout(() => setConfirmingDeleteId(null), 5000);
    return () => window.clearTimeout(reset);
  }, [confirmingDeleteId]);

  async function copyInvite() {
    if (!links) return;
    try {
      await navigator.clipboard.writeText(links.playUrl);
      setStatus("Invite link copied.");
    } catch {
      setStatus(links.playUrl);
    }
  }

  async function saveName() {
    const nextName = nameDraft.trim();
    if (!nextName || !adminToken) return;

    setSavingName(true);
    setStatus("");
    try {
      const response = await fetch(`/api/tournaments/${encodeURIComponent(tournament.slug)}`, {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ name: nextName }),
      });
      const payload = (await response.json()) as TournamentPayload;
      if (!response.ok || !payload.tournament) {
        throw new Error(payload.error ?? "Could not update tournament");
      }
      setTournamentName(payload.tournament.name);
      setNameDraft(payload.tournament.name);
      setStatus("Tournament name updated.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not update tournament");
    } finally {
      setSavingName(false);
    }
  }

  async function deleteEntry(submission: Submission) {
    if (!adminToken) return;
    if (confirmingDeleteId !== submission.id) {
      setConfirmingDeleteId(submission.id);
      setStatus(`Click confirm to remove ${submission.name}'s entry.`);
      return;
    }

    setDeletingId(submission.id);
    setConfirmingDeleteId(null);
    setStatus("");
    try {
      const response = await fetch(
        `/api/tournaments/${encodeURIComponent(tournament.slug)}/submissions`,
        {
          method: "DELETE",
          headers: {
            authorization: `Bearer ${adminToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ ids: [submission.id] }),
        },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not remove entry");
      }
      setSubmissions((current) => current.filter((item) => item.id !== submission.id));
      setStatus(`${submission.name}'s entry was removed.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not remove entry");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main className="admin-page tournament-manage-page">
      <section className="admin-hero">
        <span className="eyebrow">Creator area</span>
        <h1>{tournamentName}</h1>
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
          <strong>{hasCreatorAccess ? "Saved" : "Missing"}</strong>
        </article>
      </section>

      <section className="creator-manage-grid">
        <article className="admin-token-panel">
          <div>
            <span className="eyebrow">Invite friends</span>
            <h2>Share the tournament link</h2>
          </div>
          {links ? <code className="share-url">{links.playUrl}</code> : null}
          <button className="primary-button icon-button" onClick={copyInvite}>
            <ClipboardCheck size={16} />
            Copy invite link
          </button>
        </article>

        <article className="admin-token-panel">
          <div>
            <span className="eyebrow">Tournament details</span>
            <h2>Rename the table</h2>
          </div>
          <label className="field-label">
            Tournament name
            <input
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              maxLength={80}
              disabled={!hasCreatorAccess}
            />
          </label>
          <button
            className="primary-button icon-button"
            onClick={saveName}
            disabled={!hasCreatorAccess || savingName || !nameDraft.trim()}
          >
            <Save size={16} />
            {savingName ? "Saving..." : "Save name"}
          </button>
        </article>
      </section>

      <section className="admin-token-panel creator-entry-panel">
        <div>
          <span className="eyebrow">Entries</span>
          <h2>Manage submitted predictions</h2>
        </div>
        {!hasCreatorAccess ? (
          <p className="form-status">
            Open this page from the manage link to enable creator controls.
          </p>
        ) : null}
        <div className="creator-entry-list">
          {submissions.length ? (
            submissions.map((submission) => (
              <article className="creator-entry-row" key={submission.id}>
                <div>
                  <strong>{submission.name}</strong>
                  <span>{formatDate(submission.createdAt)}</span>
                </div>
                <button
                  className="secondary-button icon-button"
                  onClick={() => deleteEntry(submission)}
                  disabled={!hasCreatorAccess || deletingId === submission.id}
                >
                  <Trash2 size={16} />
                  {deletingId === submission.id
                    ? "Removing..."
                    : confirmingDeleteId === submission.id
                      ? "Confirm remove"
                      : "Remove"}
                </button>
              </article>
            ))
          ) : (
            <p className="form-status">No entries yet.</p>
          )}
        </div>
        {status ? <p className="form-status">{status}</p> : null}
      </section>
    </main>
  );
}
