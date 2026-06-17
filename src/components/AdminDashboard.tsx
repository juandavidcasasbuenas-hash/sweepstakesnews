"use client";

import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Download,
  Eye,
  KeyRound,
  RefreshCw,
  Save,
  Search,
  Trash2,
  UsersRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { fixtures } from "@/data/fixtures";
import { displayMatchNumber, emptyBonuses } from "@/lib/tournament";
import type { Fixture, ResultMatch, Submission, TournamentResults } from "@/types/game";

type SubmissionsPayload = {
  mode?: string;
  submissions?: Submission[];
  error?: string;
};

type ResultsPayload = {
  mode?: string;
  results?: TournamentResults;
  error?: string;
};

type HealthPayload = {
  status?: "ok" | "warn" | "error";
  checkedAt?: string;
  checks?: Array<{
    label: string;
    status: "ok" | "warn" | "error";
    detail: string;
  }>;
  data?: {
    submissionCount: number | null;
    resultCount: number;
    resultsUpdatedAt: string;
    manualOverride: boolean;
    providerWarning: string;
    playerStatsMatchCount?: number;
    playerStatsUpdatedAt?: string;
    playerStatsWarning?: string;
    playerStatsBudget?: { cap: number; count: number; exhausted: boolean } | null;
  };
  error?: string;
};

type AdminTab = "entries" | "results" | "health";

type ResultDraft = {
  home: string;
  away: string;
  status: string;
  winner: string;
  homePen: string;
  awayPen: string;
};

const adminTokenKey = "sweepstakes-news-admin-token";
const manualResultsWarning = "Manual admin results are being used.";
const blankResults: TournamentResults = {
  matches: {},
  bonuses: emptyBonuses(),
  updatedAt: new Date(0).toISOString(),
};
const sortedFixtures = [...fixtures].sort((a, b) => displayMatchNumber(a) - displayMatchNumber(b));

function formatDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unknown date";
  return date.toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function finalSummary(submission: Submission) {
  const final = submission.picks?.[104];
  if (!final) return "No final pick";
  const home = final.home === "" ? "-" : final.home;
  const away = final.away === "" ? "-" : final.away;
  return `${home}-${away}${final.winner ? `, ${final.winner} wins` : ""}`;
}

function completedPickCount(submission: Submission) {
  return Object.values(submission.picks ?? {}).filter(
    (pick) => typeof pick.home === "number" && typeof pick.away === "number",
  ).length;
}

function formatFixtureLabel(fixture: Fixture) {
  return `M${displayMatchNumber(fixture)} · ${fixture.team1} v ${fixture.team2}`;
}

function fixtureSearchText(fixture: Fixture) {
  return [
    displayMatchNumber(fixture),
    fixture.team1,
    fixture.team2,
    fixture.round,
    fixture.group ?? "",
    fixture.stage,
    fixture.venue,
    fixture.date,
  ].join(" ").toLowerCase();
}

function draftFromResult(result?: ResultMatch): ResultDraft {
  return {
    home: typeof result?.home === "number" ? String(result.home) : "",
    away: typeof result?.away === "number" ? String(result.away) : "",
    status: result?.status ?? "completed",
    winner: result?.winner ?? "",
    homePen: typeof result?.homePen === "number" ? String(result.homePen) : "",
    awayPen: typeof result?.awayPen === "number" ? String(result.awayPen) : "",
  };
}

function parseScore(value: string) {
  if (value.trim() === "") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return Math.floor(parsed);
}

function isKnockoutFixture(fixture: Fixture) {
  return fixture.stage !== "group";
}

function inferredWinner(fixture: Fixture, home: number, away: number, draft: ResultDraft) {
  if (home > away) return fixture.team1;
  if (away > home) return fixture.team2;
  if (isKnockoutFixture(fixture)) return draft.winner || undefined;
  return undefined;
}

function toCsv(submissions: Submission[]) {
  const rows = [
    ["id", "name", "createdAt", "completedPicks", "topScorer", "goldenBall", "mostGoalsTeam"],
    ...submissions.map((submission) => [
      submission.id,
      submission.name,
      submission.createdAt,
      String(completedPickCount(submission)),
      submission.bonuses.topScorer,
      submission.bonuses.goldenBall,
      submission.bonuses.mostGoalsTeam,
    ]),
  ];

  return rows
    .map((row) =>
      row
        .map((cell) => `"${String(cell).replaceAll('"', '""')}"`)
        .join(","),
    )
    .join("\n");
}

function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<AdminTab>("entries");
  const [token, setToken] = useState("");
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [results, setResults] = useState<TournamentResults>(blankResults);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [selectedFixtureId, setSelectedFixtureId] = useState<number>(sortedFixtures[0]?.id ?? 1);
  const [query, setQuery] = useState("");
  const [fixtureQuery, setFixtureQuery] = useState("");
  const [nameDrafts, setNameDrafts] = useState<Record<string, string>>({});
  const [resultDrafts, setResultDrafts] = useState<Record<number, Partial<ResultDraft>>>({});
  const [bonusDraft, setBonusDraft] = useState(emptyBonuses);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [resultsLoading, setResultsLoading] = useState(true);
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const filteredSubmissions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return submissions;
    return submissions.filter((submission) =>
      [submission.name, submission.id, submission.bonuses.topScorer, submission.bonuses.goldenBall]
        .some((value) => value.toLowerCase().includes(needle)),
    );
  }, [query, submissions]);

  const selectedEntry = useMemo(
    () =>
      submissions.find((submission) => submission.id === selectedEntryId) ??
      filteredSubmissions[0] ??
      null,
    [filteredSubmissions, selectedEntryId, submissions],
  );
  const filteredFixtures = useMemo(() => {
    const needle = fixtureQuery.trim().toLowerCase();
    if (!needle) return sortedFixtures;
    return sortedFixtures.filter((fixture) => fixtureSearchText(fixture).includes(needle));
  }, [fixtureQuery]);
  const selectedFixture = useMemo(
    () =>
      sortedFixtures.find((fixture) => fixture.id === selectedFixtureId) ??
      filteredFixtures[0] ??
      sortedFixtures[0],
    [filteredFixtures, selectedFixtureId],
  );

  const selectedCount = selectedIds.size;
  const selectedNameDraft = selectedEntry
    ? nameDrafts[selectedEntry.id] ?? selectedEntry.name
    : "";
  const selectedResult = selectedFixture ? results.matches[selectedFixture.id] : undefined;
  const selectedResultDraft = selectedFixture
    ? { ...draftFromResult(selectedResult), ...resultDrafts[selectedFixture.id] }
    : draftFromResult();
  const completedResultsCount = Object.keys(results.matches ?? {}).length;
  const totalCompletedPicks = useMemo(
    () => submissions.reduce((total, submission) => total + completedPickCount(submission), 0),
    [submissions],
  );

  useEffect(() => {
    queueMicrotask(() => {
      setToken(window.localStorage.getItem(adminTokenKey) ?? "");
      void loadSubmissions();
      void loadResults();
    });
  }, []);

  async function loadSubmissions() {
    setLoading(true);
    setStatus("");
    try {
      const response = await fetch("/api/submissions", { cache: "no-store" });
      const payload = (await response.json()) as SubmissionsPayload;
      if (!response.ok) throw new Error(payload.error ?? "Could not load entries");
      const next = payload.submissions ?? [];
      setSubmissions(next);
      setSelectedIds((current) => new Set(next.filter((item) => current.has(item.id)).map((item) => item.id)));
      setSelectedEntryId((current) =>
        current && next.some((submission) => submission.id === current)
          ? current
          : next[0]?.id ?? null,
      );
      setStatus(`${next.length} entr${next.length === 1 ? "y" : "ies"} loaded.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not load entries");
    } finally {
      setLoading(false);
    }
  }

  async function loadResults() {
    setResultsLoading(true);
    setStatus("");
    try {
      const response = await fetch("/api/results", { cache: "no-store" });
      const payload = (await response.json()) as ResultsPayload;
      if (!response.ok) throw new Error(payload.error ?? "Could not load results");
      const next = payload.results ?? blankResults;
      setResults(next);
      setBonusDraft(next.bonuses ?? emptyBonuses());
      setStatus(`${Object.keys(next.matches ?? {}).length} manual/live result${Object.keys(next.matches ?? {}).length === 1 ? "" : "s"} loaded.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not load results");
    } finally {
      setResultsLoading(false);
    }
  }

  function saveToken() {
    const next = token.trim();
    if (next) {
      window.localStorage.setItem(adminTokenKey, next);
      setToken(next);
      setStatus("Admin token saved in this browser.");
    } else {
      window.localStorage.removeItem(adminTokenKey);
      setStatus("Admin token cleared.");
    }
  }

  async function adminFetch(path: string, init: RequestInit) {
    const adminToken = token.trim();
    if (!adminToken) throw new Error("Enter your admin token first.");

    const response = await fetch(path, {
      ...init,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${adminToken}`,
        ...init.headers,
      },
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) throw new Error(payload.error ?? "Admin request failed");
    return payload;
  }

  async function loadHealth() {
    setHealthLoading(true);
    setStatus("");
    try {
      const payload = (await adminFetch("/api/admin/health", {
        method: "GET",
      })) as HealthPayload;
      setHealth(payload);
      setStatus(
        payload.status === "ok"
          ? "Health check passed."
          : payload.status === "warn"
            ? "Health check completed with warnings."
            : "Health check found errors.",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not run health check";
      setHealth({ status: "error", error: message, checks: [] });
      setStatus(message);
    } finally {
      setHealthLoading(false);
    }
  }

  async function saveResultsPayload(nextResults: TournamentResults, message: string) {
    setSaving(true);
    try {
      const payload = (await adminFetch("/api/results", {
        method: "POST",
        body: JSON.stringify(nextResults),
      })) as ResultsPayload;
      const saved = payload.results ?? nextResults;
      setResults(saved);
      setBonusDraft(saved.bonuses ?? emptyBonuses());
      setStatus(message);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save results");
    } finally {
      setSaving(false);
    }
  }

  function updateResultDraft(fixtureId: number, patch: Partial<ResultDraft>) {
    setResultDrafts((current) => ({
      ...current,
      [fixtureId]: { ...current[fixtureId], ...patch },
    }));
  }

  async function saveSelectedResult() {
    if (!selectedFixture) return;

    const draft = selectedResultDraft;
    const home = parseScore(draft.home);
    const away = parseScore(draft.away);
    if (typeof home !== "number" || typeof away !== "number") {
      setStatus("Enter both scores before saving a result.");
      return;
    }

    const homePen = parseScore(draft.homePen);
    const awayPen = parseScore(draft.awayPen);
    const winner = inferredWinner(selectedFixture, home, away, draft);
    if (isKnockoutFixture(selectedFixture) && home === away && !winner) {
      setStatus("Choose a winner for a tied knockout match.");
      return;
    }

    const match: ResultMatch = {
      fixtureId: selectedFixture.id,
      team1: selectedFixture.team1,
      team2: selectedFixture.team2,
      home,
      away,
      winner,
      status: draft.status || "completed",
      homePen,
      awayPen,
    };
    const nextResults: TournamentResults = {
      ...results,
      matches: { ...results.matches, [selectedFixture.id]: match },
      bonuses: bonusDraft,
      updatedAt: new Date().toISOString(),
      providerCheckedAt: new Date().toISOString(),
      providerWarning: manualResultsWarning,
      manualOverride: true,
    };

    await saveResultsPayload(nextResults, `Saved result for ${formatFixtureLabel(selectedFixture)}.`);
    setResultDrafts((current) => {
      const next = { ...current };
      delete next[selectedFixture.id];
      return next;
    });
  }

  async function removeSelectedResult() {
    if (!selectedFixture || !results.matches[selectedFixture.id]) return;
    const confirmed = window.confirm(`Remove the saved result for ${formatFixtureLabel(selectedFixture)}?`);
    if (!confirmed) return;

    const nextMatches = { ...results.matches };
    delete nextMatches[selectedFixture.id];
    const nextResults: TournamentResults = {
      ...results,
      matches: nextMatches,
      bonuses: bonusDraft,
      updatedAt: new Date().toISOString(),
      providerCheckedAt: new Date().toISOString(),
      providerWarning: manualResultsWarning,
      manualOverride: true,
    };
    await saveResultsPayload(nextResults, `Removed result for ${formatFixtureLabel(selectedFixture)}.`);
  }

  async function saveBonusResults() {
    const nextResults: TournamentResults = {
      ...results,
      bonuses: bonusDraft,
      updatedAt: new Date().toISOString(),
      providerCheckedAt: new Date().toISOString(),
      providerWarning: manualResultsWarning,
      manualOverride: true,
    };
    await saveResultsPayload(nextResults, "Saved bonus results.");
  }

  async function resumeLiveResults() {
    const confirmed = window.confirm("Resume live API updates? Future public refreshes may overwrite manually entered results.");
    if (!confirmed) return;

    const nextResults: TournamentResults = {
      ...results,
      bonuses: bonusDraft,
      updatedAt: new Date().toISOString(),
      providerCheckedAt: new Date(0).toISOString(),
      providerWarning: undefined,
      manualOverride: false,
    };
    await saveResultsPayload(nextResults, "Live API updates resumed.");
  }

  async function renameSelectedEntry() {
    if (!selectedEntry) return;
    const name = selectedNameDraft.trim();
    if (!name || name === selectedEntry.name) return;

    setSaving(true);
    try {
      await adminFetch("/api/submissions", {
        method: "PATCH",
        body: JSON.stringify({ id: selectedEntry.id, name }),
      });
      setSubmissions((current) =>
        current.map((submission) =>
          submission.id === selectedEntry.id ? { ...submission, name } : submission,
        ),
      );
      setNameDrafts((current) => ({ ...current, [selectedEntry.id]: name }));
      setStatus(`Renamed entry to ${name}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not rename entry");
    } finally {
      setSaving(false);
    }
  }

  async function deleteEntries(ids: string[]) {
    if (!ids.length) return;
    const confirmed = window.confirm(`Delete ${ids.length} entr${ids.length === 1 ? "y" : "ies"}?`);
    if (!confirmed) return;

    setSaving(true);
    try {
      await adminFetch("/api/submissions", {
        method: "DELETE",
        body: JSON.stringify({ ids }),
      });
      setSubmissions((current) => current.filter((submission) => !ids.includes(submission.id)));
      setSelectedIds(new Set());
      setSelectedEntryId((current) => (current && ids.includes(current) ? null : current));
      setStatus(`Deleted ${ids.length} entr${ids.length === 1 ? "y" : "ies"}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not delete entries");
    } finally {
      setSaving(false);
    }
  }

  async function deleteAllEntries() {
    const confirmed = window.confirm("Delete every submitted entry? This cannot be undone.");
    if (!confirmed) return;

    setSaving(true);
    try {
      await adminFetch("/api/submissions", {
        method: "DELETE",
        body: JSON.stringify({ all: true }),
      });
      setSubmissions([]);
      setSelectedIds(new Set());
      setSelectedEntryId(null);
      setStatus("Deleted all entries.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not delete all entries");
    } finally {
      setSaving(false);
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelectedIds((current) => {
      const visibleIds = filteredSubmissions.map((submission) => submission.id);
      const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => current.has(id));
      const next = new Set(current);
      visibleIds.forEach((id) => {
        if (allVisibleSelected) next.delete(id);
        else next.add(id);
      });
      return next;
    });
  }

  return (
    <main className="admin-page">
      <section className="admin-hero">
        <div>
          <span className="eyebrow">Sweepstakes News admin</span>
          <h1>Entry desk</h1>
        </div>
        <div className="admin-token-panel">
          <label htmlFor="admin-token">Admin token</label>
          <div className="admin-token-row">
            <KeyRound size={18} />
            <input
              id="admin-token"
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="ADMIN_RESULTS_KEY"
            />
            <button className="secondary-button icon-button compact-btn" onClick={saveToken}>
              <Save size={14} />
              Save
            </button>
          </div>
        </div>
      </section>

      <section className="admin-stats" aria-label="Entry stats">
        <article>
          <span>Entries</span>
          <strong>{submissions.length}</strong>
        </article>
        <article>
          <span>Selected</span>
          <strong>{selectedCount}</strong>
        </article>
        <article>
          <span>Completed picks</span>
          <strong>{totalCompletedPicks}</strong>
        </article>
        <article>
          <span>Saved results</span>
          <strong>{completedResultsCount}</strong>
        </article>
      </section>

      <section className="admin-section-tabs" aria-label="Admin sections">
        <button
          className={activeTab === "entries" ? "active" : ""}
          onClick={() => setActiveTab("entries")}
        >
          Entries
        </button>
        <button
          className={activeTab === "results" ? "active" : ""}
          onClick={() => setActiveTab("results")}
        >
          Manual results
        </button>
        <button
          className={activeTab === "health" ? "active" : ""}
          onClick={() => {
            setActiveTab("health");
            if (token.trim()) void loadHealth();
          }}
        >
          Health
        </button>
      </section>

      {activeTab === "entries" ? (
      <section className="admin-workbench">
        <div className="admin-list-panel">
          <div className="admin-toolbar">
            <label className="admin-search">
              <Search size={17} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search entries, IDs, bonus picks"
              />
            </label>
            <button className="secondary-button icon-button compact-btn" onClick={() => void loadSubmissions()} disabled={loading}>
              <RefreshCw size={14} />
              Refresh
            </button>
          </div>

          <div className="admin-bulk-row">
            <button className="secondary-button compact-btn" onClick={toggleAllVisible}>
              {filteredSubmissions.every((submission) => selectedIds.has(submission.id)) && filteredSubmissions.length
                ? "Clear visible"
                : "Select visible"}
            </button>
            <button
              className="secondary-button icon-button compact-btn"
              onClick={() => downloadFile("sweepstakes-entries.csv", toCsv(filteredSubmissions), "text/csv")}
              disabled={!filteredSubmissions.length}
            >
              <Download size={14} />
              CSV
            </button>
            <button
              className="secondary-button icon-button compact-btn"
              onClick={() =>
                downloadFile(
                  "sweepstakes-entries.json",
                  JSON.stringify(filteredSubmissions, null, 2),
                  "application/json",
                )
              }
              disabled={!filteredSubmissions.length}
            >
              <Download size={14} />
              JSON
            </button>
            <button
              className="admin-danger-button icon-button compact-btn"
              onClick={() => void deleteEntries(Array.from(selectedIds))}
              disabled={!selectedCount || saving}
            >
              <Trash2 size={14} />
              Delete selected
            </button>
            <button
              className="admin-danger-button icon-button compact-btn"
              onClick={() => void deleteAllEntries()}
              disabled={!submissions.length || saving}
            >
              <Trash2 size={14} />
              Clear all
            </button>
          </div>

          {status ? <p className="admin-status">{loading ? "Loading entries..." : status}</p> : null}

          <div className="admin-entry-list">
            {filteredSubmissions.length ? (
              filteredSubmissions.map((submission) => (
                <article
                  key={submission.id}
                  className={`admin-entry-row${selectedEntry?.id === submission.id ? " active" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(submission.id)}
                    onChange={() => toggleSelected(submission.id)}
                    aria-label={`Select ${submission.name}`}
                  />
                  <button onClick={() => setSelectedEntryId(submission.id)}>
                    <strong>{submission.name}</strong>
                    <small>{formatDate(submission.createdAt)} · {completedPickCount(submission)}/104 picks</small>
                  </button>
                  <button
                    className="admin-icon-button"
                    onClick={() => setSelectedEntryId(submission.id)}
                    aria-label={`View ${submission.name}`}
                  >
                    <Eye size={16} />
                  </button>
                </article>
              ))
            ) : (
              <div className="admin-empty-state">
                <UsersRound size={22} />
                <span>{loading ? "Loading entries..." : "No entries found."}</span>
              </div>
            )}
          </div>
        </div>

        <aside className="admin-detail-panel">
          {selectedEntry ? (
            <>
              <div className="admin-detail-head">
                <div>
                  <span className="eyebrow">Selected entry</span>
                  <h2>{selectedEntry.name}</h2>
                  <p>{selectedEntry.id}</p>
                </div>
                <button
                  className="admin-danger-button icon-button compact-btn"
                  onClick={() => void deleteEntries([selectedEntry.id])}
                  disabled={saving}
                >
                  <Trash2 size={14} />
                  Delete
                </button>
              </div>

              <label className="admin-edit-name">
                Rename entry
                <div>
                  <input
                    value={selectedNameDraft}
                    onChange={(event) =>
                      setNameDrafts((current) => ({
                        ...current,
                        [selectedEntry.id]: event.target.value,
                      }))
                    }
                    maxLength={40}
                  />
                  <button
                    className="primary-button icon-button compact-btn"
                    onClick={() => void renameSelectedEntry()}
                    disabled={saving || !selectedNameDraft.trim() || selectedNameDraft.trim() === selectedEntry.name}
                  >
                    <Save size={14} />
                    Rename
                  </button>
                </div>
              </label>

              <div className="admin-detail-grid">
                <article>
                  <span>Submitted</span>
                  <strong>{formatDate(selectedEntry.createdAt)}</strong>
                </article>
                <article>
                  <span>Picks</span>
                  <strong>{completedPickCount(selectedEntry)}/104</strong>
                </article>
                <article>
                  <span>Final</span>
                  <strong>{finalSummary(selectedEntry)}</strong>
                </article>
              </div>

              <div className="admin-bonus-panel">
                <h3>Bonus picks</h3>
                <dl>
                  <div>
                    <dt>Top scorer</dt>
                    <dd>{selectedEntry.bonuses.topScorer || "Blank"}</dd>
                  </div>
                  <div>
                    <dt>Golden ball</dt>
                    <dd>{selectedEntry.bonuses.goldenBall || "Blank"}</dd>
                  </div>
                  <div>
                    <dt>Most goals team</dt>
                    <dd>{selectedEntry.bonuses.mostGoalsTeam || "Blank"}</dd>
                  </div>
                </dl>
              </div>
            </>
          ) : (
            <div className="admin-empty-state detail-empty">
              <UsersRound size={24} />
              <span>Select an entry to inspect it.</span>
            </div>
          )}
        </aside>
      </section>
      ) : null}

      {activeTab === "results" ? (
        <section className="admin-workbench admin-results-workbench">
          <div className="admin-list-panel">
            <div className="admin-toolbar">
              <label className="admin-search">
                <Search size={17} />
                <input
                  value={fixtureQuery}
                  onChange={(event) => setFixtureQuery(event.target.value)}
                  placeholder="Search matches, teams, rounds, venues"
                />
              </label>
              <button
                className="secondary-button icon-button compact-btn"
                onClick={() => void loadResults()}
                disabled={resultsLoading}
              >
                <RefreshCw size={14} />
                Refresh
              </button>
            </div>

            <div className="admin-bulk-row">
              <span className={results.manualOverride ? "admin-override-pill active" : "admin-override-pill"}>
                {results.manualOverride ? "Manual override on" : "Live API allowed"}
              </span>
              <button
                className="secondary-button icon-button compact-btn"
                onClick={() => void resumeLiveResults()}
                disabled={saving || !results.manualOverride}
              >
                <RefreshCw size={14} />
                Resume live API
              </button>
            </div>

            {status ? (
              <p className="admin-status">
                {resultsLoading && activeTab === "results" ? "Loading results..." : status}
              </p>
            ) : null}

            <div className="admin-entry-list admin-fixture-list">
              {filteredFixtures.map((fixture) => {
                const result = results.matches[fixture.id];
                return (
                  <article
                    key={fixture.id}
                    className={`admin-entry-row admin-fixture-row${selectedFixture?.id === fixture.id ? " active" : ""}`}
                  >
                    <button onClick={() => setSelectedFixtureId(fixture.id)}>
                      <strong>{formatFixtureLabel(fixture)}</strong>
                      <small>
                        {fixture.date} · {fixture.round}
                        {result ? ` · ${result.home}-${result.away}` : " · no result"}
                      </small>
                    </button>
                    <span className={result ? "admin-result-badge saved" : "admin-result-badge"}>
                      {result ? "Saved" : "Open"}
                    </span>
                  </article>
                );
              })}
            </div>
          </div>

          <aside className="admin-detail-panel">
            {selectedFixture ? (
              <>
                <div className="admin-detail-head">
                  <div>
                    <span className="eyebrow">Manual result</span>
                    <h2>M{displayMatchNumber(selectedFixture)}</h2>
                    <p>{selectedFixture.team1} v {selectedFixture.team2}</p>
                  </div>
                  <button
                    className="admin-danger-button icon-button compact-btn"
                    onClick={() => void removeSelectedResult()}
                    disabled={saving || !selectedResult}
                  >
                    <Trash2 size={14} />
                    Remove
                  </button>
                </div>

                <div className="admin-detail-grid">
                  <article>
                    <span>Date</span>
                    <strong>{selectedFixture.date}</strong>
                  </article>
                  <article>
                    <span>Round</span>
                    <strong>{selectedFixture.round}</strong>
                  </article>
                  <article>
                    <span>Venue</span>
                    <strong>{selectedFixture.venue}</strong>
                  </article>
                </div>

                <div className="admin-result-editor">
                  <label>
                    {selectedFixture.team1}
                    <input
                      type="number"
                      min="0"
                      value={selectedResultDraft.home}
                      onChange={(event) =>
                        updateResultDraft(selectedFixture.id, { home: event.target.value })
                      }
                      placeholder="0"
                    />
                  </label>
                  <label>
                    {selectedFixture.team2}
                    <input
                      type="number"
                      min="0"
                      value={selectedResultDraft.away}
                      onChange={(event) =>
                        updateResultDraft(selectedFixture.id, { away: event.target.value })
                      }
                      placeholder="0"
                    />
                  </label>
                  <label>
                    Status
                    <select
                      value={selectedResultDraft.status}
                      onChange={(event) =>
                        updateResultDraft(selectedFixture.id, { status: event.target.value })
                      }
                    >
                      <option value="scheduled">Scheduled</option>
                      <option value="live">Live</option>
                      <option value="completed">Completed</option>
                    </select>
                  </label>
                </div>

                {isKnockoutFixture(selectedFixture) ? (
                  <div className="admin-result-editor admin-result-editor-secondary">
                    <label>
                      Winner
                      <select
                        value={selectedResultDraft.winner}
                        onChange={(event) =>
                          updateResultDraft(selectedFixture.id, { winner: event.target.value })
                        }
                      >
                        <option value="">Infer from score</option>
                        <option value={selectedFixture.team1}>{selectedFixture.team1}</option>
                        <option value={selectedFixture.team2}>{selectedFixture.team2}</option>
                      </select>
                    </label>
                    <label>
                      {selectedFixture.team1} pens
                      <input
                        type="number"
                        min="0"
                        value={selectedResultDraft.homePen}
                        onChange={(event) =>
                          updateResultDraft(selectedFixture.id, { homePen: event.target.value })
                        }
                        placeholder="Optional"
                      />
                    </label>
                    <label>
                      {selectedFixture.team2} pens
                      <input
                        type="number"
                        min="0"
                        value={selectedResultDraft.awayPen}
                        onChange={(event) =>
                          updateResultDraft(selectedFixture.id, { awayPen: event.target.value })
                        }
                        placeholder="Optional"
                      />
                    </label>
                  </div>
                ) : null}

                <button
                  className="primary-button icon-button admin-wide-button"
                  onClick={() => void saveSelectedResult()}
                  disabled={saving}
                >
                  <Save size={16} />
                  Save match result
                </button>

                <div className="admin-bonus-panel">
                  <h3>Tournament bonus results</h3>
                  <div className="admin-bonus-editor">
                    <label>
                      Top scorer
                      <input
                        value={bonusDraft.topScorer}
                        onChange={(event) =>
                          setBonusDraft((current) => ({ ...current, topScorer: event.target.value }))
                        }
                      />
                    </label>
                    <label>
                      Golden ball
                      <input
                        value={bonusDraft.goldenBall}
                        onChange={(event) =>
                          setBonusDraft((current) => ({ ...current, goldenBall: event.target.value }))
                        }
                      />
                    </label>
                    <label>
                      Most goals team
                      <input
                        value={bonusDraft.mostGoalsTeam}
                        onChange={(event) =>
                          setBonusDraft((current) => ({ ...current, mostGoalsTeam: event.target.value }))
                        }
                      />
                    </label>
                  </div>
                  <button
                    className="secondary-button icon-button compact-btn admin-wide-button"
                    onClick={() => void saveBonusResults()}
                    disabled={saving}
                  >
                    <Save size={14} />
                    Save bonus results
                  </button>
                </div>
              </>
            ) : (
              <div className="admin-empty-state detail-empty">
                <UsersRound size={24} />
                <span>Select a match to edit results.</span>
              </div>
            )}
          </aside>
        </section>
      ) : null}

      {activeTab === "health" ? (
        <section className="admin-health-panel">
          <div className="admin-toolbar">
            <div>
              <span className="eyebrow">System status</span>
              <h2>Admin health</h2>
            </div>
            <button
              className="secondary-button icon-button compact-btn"
              onClick={() => void loadHealth()}
              disabled={healthLoading}
            >
              <RefreshCw size={14} />
              {healthLoading ? "Checking..." : "Run check"}
            </button>
          </div>

          {status ? <p className="admin-status">{status}</p> : null}

          {health ? (
            <>
              <div className="admin-health-summary">
                <article className={`health-summary-card ${health.status ?? "warn"}`}>
                  <span>Overall</span>
                  <strong>{health.status ?? "Unknown"}</strong>
                </article>
                <article>
                  <span>Submissions</span>
                  <strong>{health.data?.submissionCount ?? "—"}</strong>
                </article>
                <article>
                  <span>Results</span>
                  <strong>{health.data?.resultCount ?? "—"}</strong>
                </article>
                <article>
                  <span>Stat cache</span>
                  <strong>{health.data?.playerStatsMatchCount ?? "—"}</strong>
                </article>
                <article>
                  <span>Override</span>
                  <strong>{health.data?.manualOverride ? "On" : "Off"}</strong>
                </article>
              </div>

              {health.error ? (
                <div className="admin-health-error">
                  <AlertTriangle size={18} />
                  <span>{health.error}</span>
                </div>
              ) : null}

              <div className="admin-health-list">
                {(health.checks ?? []).map((item) => (
                  <article className={`admin-health-row ${item.status}`} key={item.label}>
                    <span className="admin-health-icon" aria-hidden="true">
                      {item.status === "ok" ? (
                        <CheckCircle2 size={18} />
                      ) : item.status === "warn" ? (
                        <AlertTriangle size={18} />
                      ) : (
                        <Activity size={18} />
                      )}
                    </span>
                    <div>
                      <strong>{item.label}</strong>
                      <small>{item.detail}</small>
                    </div>
                  </article>
                ))}
              </div>

              {health.checkedAt ? (
                <p className="admin-status">Last checked {formatDate(health.checkedAt)}</p>
              ) : null}
            </>
          ) : (
            <div className="admin-empty-state detail-empty">
              <Activity size={24} />
              <span>Run a health check to inspect the live admin setup.</span>
            </div>
          )}
        </section>
      ) : null}
    </main>
  );
}
