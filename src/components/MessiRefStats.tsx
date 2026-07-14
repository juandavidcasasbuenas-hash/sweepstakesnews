"use client";

import { ArrowDownUp, BadgeCheck, Flag, Search, UserRoundSearch } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  messiRefereeRecords,
  messiRefereeSource,
  type MessiRefereeRecord,
} from "@/data/messi-referees";
import {
  argentinaWorldCup2026RefereeSource,
  bundledArgentinaWorldCup2026Referees,
  isRefereeInList,
  isWorldCup2026Referee,
  worldCup2026RefereeSource,
} from "@/data/world-cup-2026-referees";

type SortKey = "name" | "country" | "games" | "wins" | "losses" | "draws" | "winRate";
type SortDirection = "asc" | "desc";
type RefereeApiPayload = {
  snapshot?: {
    records?: MessiRefereeRecord[];
    argentinaWorldCup2026Referees?: string[];
    argentinaWorldCup2026SourceUrl?: string;
    sourceRows?: number;
    sourceUrl?: string;
    updatedAt?: string;
  };
};

const collator = new Intl.Collator("en", { sensitivity: "base" });

function rate(row: MessiRefereeRecord) {
  return row.games ? row.wins / row.games : 0;
}

function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function SortButton({
  column,
  activeKey,
  direction,
  label,
  onSort,
}: {
  column: SortKey;
  activeKey: SortKey;
  direction: SortDirection;
  label: string;
  onSort: (column: SortKey) => void;
}) {
  const active = column === activeKey;
  return (
    <button
      type="button"
      className={active ? "active" : ""}
      onClick={() => onSort(column)}
      aria-label={`Sort by ${label}${active ? `, currently ${direction}ending` : ""}`}
    >
      {label}
      <span aria-hidden="true">{active ? (direction === "asc" ? "↑" : "↓") : "↕"}</span>
    </button>
  );
}

export default function MessiRefStats() {
  const [records, setRecords] = useState(messiRefereeRecords);
  const [argentinaWorldCupReferees, setArgentinaWorldCupReferees] = useState<string[]>([
    ...bundledArgentinaWorldCup2026Referees,
  ]);
  const [argentinaWorldCupSourceUrl, setArgentinaWorldCupSourceUrl] = useState<string>(
    argentinaWorldCup2026RefereeSource.url,
  );
  const [sourceMeta, setSourceMeta] = useState<{
    sourceRows: number;
    sourceUrl: string;
    updatedAt: string;
  }>({
    sourceRows: messiRefereeSource.sourceRows,
    sourceUrl: messiRefereeSource.url,
    updatedAt: "2026-07-14T00:00:00.000Z",
  });
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("all");
  const [worldCupOnly, setWorldCupOnly] = useState(false);
  const [argentinaWorldCupOnly, setArgentinaWorldCupOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("games");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/messi-referees", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: RefereeApiPayload) => {
        if (cancelled || !payload.snapshot?.records?.length) return;
        setRecords(payload.snapshot.records);
        if (payload.snapshot.argentinaWorldCup2026Referees?.length) {
          setArgentinaWorldCupReferees(payload.snapshot.argentinaWorldCup2026Referees);
        }
        setArgentinaWorldCupSourceUrl(
          payload.snapshot.argentinaWorldCup2026SourceUrl ??
            argentinaWorldCup2026RefereeSource.url,
        );
        setSourceMeta({
          sourceRows: payload.snapshot.sourceRows ?? payload.snapshot.records.length,
          sourceUrl: payload.snapshot.sourceUrl ?? messiRefereeSource.url,
          updatedAt: payload.snapshot.updatedAt ?? new Date().toISOString(),
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const totals = useMemo(
    () =>
      records.reduce(
        (sum, row) => ({
          games: sum.games + row.games,
          wins: sum.wins + row.wins,
          losses: sum.losses + row.losses,
          draws: sum.draws + row.draws,
        }),
        { games: 0, wins: 0, losses: 0, draws: 0 },
      ),
    [records],
  );

  const countries = useMemo(
    () => Array.from(new Set(records.map((row) => row.country))).sort(collator.compare),
    [records],
  );

  const worldCupRecordCount = useMemo(
    () => records.filter((row) => isWorldCup2026Referee(row.name)).length,
    [records],
  );

  const argentinaWorldCupRecordCount = useMemo(
    () =>
      records.filter((row) => isRefereeInList(row.name, argentinaWorldCupReferees)).length,
    [argentinaWorldCupReferees, records],
  );

  const visibleRows = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return records
      .filter(
        (row) =>
          (!worldCupOnly || isWorldCup2026Referee(row.name)) &&
          (!argentinaWorldCupOnly ||
            isRefereeInList(row.name, argentinaWorldCupReferees)) &&
          (country === "all" || row.country === country) &&
          (!normalizedQuery ||
            row.name.toLocaleLowerCase().includes(normalizedQuery) ||
            row.country.toLocaleLowerCase().includes(normalizedQuery)),
      )
      .sort((a, b) => {
        let result: number;
        if (sortKey === "name" || sortKey === "country") {
          result = collator.compare(a[sortKey], b[sortKey]);
        } else if (sortKey === "winRate") {
          result = rate(a) - rate(b);
        } else {
          result = a[sortKey] - b[sortKey];
        }
        if (result === 0) result = collator.compare(a.name, b.name);
        return sortDirection === "asc" ? result : -result;
      });
  }, [
    argentinaWorldCupOnly,
    argentinaWorldCupReferees,
    country,
    query,
    records,
    sortDirection,
    sortKey,
    worldCupOnly,
  ]);

  function sortBy(column: SortKey) {
    if (column === sortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(column);
    setSortDirection(column === "name" || column === "country" ? "asc" : "desc");
  }

  return (
    <div className="messi-ref-page">
      <section className="messi-ref-intro" aria-labelledby="messi-ref-title">
        <div className="messi-ref-heading">
          <span className="eyebrow">The complete whistle ledger</span>
          <h2 id="messi-ref-title">Every referee. Every Messi result.</h2>
          <p>
            Lionel Messi&apos;s match record grouped by the referee in charge, across club and
            country. Search a name, filter a nation or sort any column.
          </p>
        </div>
        <div className="messi-ref-total" aria-label={`${records.length} referees`}>
          <UserRoundSearch size={26} aria-hidden="true" />
          <strong>{records.length}</strong>
          <span>unique referees</span>
        </div>
      </section>

      <section className="messi-ref-scoreboard" aria-label="Messi referee record totals">
        <article className="messi-ref-score-main">
          <span>Career ledger</span>
          <strong>{totals.games.toLocaleString("en-GB")}</strong>
          <small>games tracked</small>
        </article>
        <article className="is-win"><span>W</span><strong>{totals.wins}</strong><small>Wins</small></article>
        <article className="is-loss"><span>L</span><strong>{totals.losses}</strong><small>Losses</small></article>
        <article className="is-draw"><span>D</span><strong>{totals.draws}</strong><small>Draws</small></article>
        <article className="messi-ref-rate">
          <span>Win rate</span>
          <strong>{percent(totals.wins / totals.games)}</strong>
          <small>across all tracked matches</small>
        </article>
      </section>

      <section className="messi-ref-ledger" aria-labelledby="messi-ref-ledger-title">
        <div className="messi-ref-toolbar">
          <div>
            <span className="eyebrow">Name by name</span>
            <h3 id="messi-ref-ledger-title">The referee index</h3>
          </div>
          <div className="messi-ref-controls">
            <button
              type="button"
              className={`messi-ref-wc-filter${worldCupOnly ? " active" : ""}`}
              aria-pressed={worldCupOnly}
              onClick={() => setWorldCupOnly((current) => !current)}
            >
              <BadgeCheck size={17} aria-hidden="true" />
              <span>World Cup 2026</span>
              <strong>{worldCupRecordCount}</strong>
            </button>
            <button
              type="button"
              className={`messi-ref-wc-filter is-argentina${argentinaWorldCupOnly ? " active" : ""}`}
              aria-pressed={argentinaWorldCupOnly}
              onClick={() => setArgentinaWorldCupOnly((current) => !current)}
            >
              <Flag size={16} aria-hidden="true" />
              <span>Argentina at WC26</span>
              <strong>{argentinaWorldCupRecordCount}</strong>
            </button>
            <label className="messi-ref-search">
              <Search size={17} aria-hidden="true" />
              <span className="sr-only">Search referees or countries</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search referee or country…"
              />
            </label>
            <label className="messi-ref-country">
              <span className="sr-only">Filter by country</span>
              <select value={country} onChange={(event) => setCountry(event.target.value)}>
                <option value="all">All {countries.length} countries</option>
                {countries.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
          </div>
        </div>

        <div className="messi-ref-result-count" aria-live="polite">
          <ArrowDownUp size={14} aria-hidden="true" />
          Showing <strong>{visibleRows.length}</strong> of {records.length} referees
          <span className="messi-ref-wc-legend">
            <BadgeCheck size={14} aria-hidden="true" /> WC 26 = appointed referee
            <span aria-hidden="true">·</span>
            <Flag size={13} aria-hidden="true" /> ARG = Argentina match
          </span>
        </div>

        <div className="messi-ref-table-wrap">
          <table className="messi-ref-table">
            <thead>
              <tr>
                <th className="messi-ref-rank" scope="col">#</th>
                <th scope="col"><SortButton column="name" activeKey={sortKey} direction={sortDirection} label="Referee" onSort={sortBy} /></th>
                <th className="messi-ref-country-col" scope="col"><SortButton column="country" activeKey={sortKey} direction={sortDirection} label="Country" onSort={sortBy} /></th>
                <th scope="col"><SortButton column="games" activeKey={sortKey} direction={sortDirection} label="GP" onSort={sortBy} /></th>
                <th scope="col"><SortButton column="wins" activeKey={sortKey} direction={sortDirection} label="W" onSort={sortBy} /></th>
                <th scope="col"><SortButton column="losses" activeKey={sortKey} direction={sortDirection} label="L" onSort={sortBy} /></th>
                <th scope="col"><SortButton column="draws" activeKey={sortKey} direction={sortDirection} label="D" onSort={sortBy} /></th>
                <th className="messi-ref-rate-col" scope="col"><SortButton column="winRate" activeKey={sortKey} direction={sortDirection} label="Win %" onSort={sortBy} /></th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, index) => {
                const atWorldCup = isWorldCup2026Referee(row.name);
                const handledArgentina = isRefereeInList(row.name, argentinaWorldCupReferees);
                const rowClasses = [
                  atWorldCup ? "is-world-cup-ref" : "",
                  handledArgentina ? "is-argentina-wc-ref" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <tr className={rowClasses} key={`${row.name}-${row.country}`}>
                    <td className="messi-ref-rank">{String(index + 1).padStart(3, "0")}</td>
                    <th scope="row">
                      <span className="messi-ref-name-line">
                        <strong>{row.name}</strong>
                        {atWorldCup ? (
                          <span className="messi-ref-wc-badge" title="Appointed referee at the FIFA World Cup 2026">
                            <BadgeCheck size={11} aria-hidden="true" /> WC 26
                          </span>
                        ) : null}
                        {handledArgentina ? (
                          <span className="messi-ref-wc-badge is-argentina" title="Referee for an Argentina match at the FIFA World Cup 2026">
                            <Flag size={10} aria-hidden="true" /> ARG
                          </span>
                        ) : null}
                      </span>
                      <small>{row.country}</small>
                    </th>
                    <td className="messi-ref-country-col">{row.country}</td>
                    <td className="messi-ref-gp">{row.games}</td>
                    <td className="messi-ref-win">{row.wins}</td>
                    <td className="messi-ref-loss">{row.losses}</td>
                    <td>{row.draws}</td>
                    <td className="messi-ref-rate-col">{percent(rate(row))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {visibleRows.length === 0 ? (
            <div className="messi-ref-empty">
              <strong>No referee found</strong>
              <span>Try another spelling or reset the country filter.</span>
            </div>
          ) : null}
        </div>

        <footer className="messi-ref-source">
          <p>
            Last refreshed: <a href={sourceMeta.sourceUrl} target="_blank" rel="noreferrer">{messiRefereeSource.label}</a>,
            {` ${new Date(sourceMeta.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC", year: "numeric" })}. `}
            GP is games played; W/L/D is Messi&apos;s team result. The source&apos;s duplicate entries
            for the same name and country are combined here, turning {sourceMeta.sourceRows} source rows into {records.length} unique referees.
            {" "}World Cup markers use <a href={worldCup2026RefereeSource.url} target="_blank" rel="noreferrer">{worldCup2026RefereeSource.label}</a> and include its 52 appointed referees, excluding assistant and video-only officials.
            {" "}Argentina markers are refreshed from <a href={argentinaWorldCupSourceUrl} target="_blank" rel="noreferrer">{argentinaWorldCup2026RefereeSource.label}</a> and include any assigned referee, whether or not Messi played.
          </p>
        </footer>
      </section>
    </div>
  );
}
