import assert from "node:assert/strict";
import test from "node:test";
import {
  parseArgentinaWorldCup2026Referees,
  parseMessiRefereeHtml,
} from "@/lib/messi-referees";

function row(index: number, name: string, country: string, games: number, wins: number, draws: number, losses: number) {
  return `<tr>
    <td>${index}</td><td>${name}</td><td>${country}</td>
    <td>${games}</td><td>${wins}</td><td>${draws}</td><td>${losses}</td>
    <td>0%</td>
  </tr>`;
}

test("parses and merges the MessiStats referee table", () => {
  const html = `<main>
    <section class="results"><table><tbody>
      ${row(1, "François Letexier", "France", 2, 1, 1, 0)}
      ${row(2, "François Letexier", "France", 7, 5, 0, 2)}
      ${row(3, "Antonio Mateu Lahoz", "Spain", 41, 26, 10, 5)}
    </tbody></table></section>
  </main>`;

  const parsed = parseMessiRefereeHtml(html);
  assert.equal(parsed.sourceRows, 3);
  assert.deepEqual(parsed.records, [
    { name: "Antonio Mateu Lahoz", country: "Spain", games: 41, wins: 26, losses: 5, draws: 10 },
    { name: "François Letexier", country: "France", games: 9, wins: 6, losses: 2, draws: 1 },
  ]);
});

test("rejects malformed result rows instead of corrupting the cache", () => {
  const html = `<section class="results"><table><tbody>
    ${row(1, "Valid Ref", "England", 3, 2, 1, 0)}
    ${row(2, "Broken Ref", "England", 9, 1, 1, 1)}
  </tbody></table></section>`;

  const parsed = parseMessiRefereeHtml(html);
  assert.equal(parsed.sourceRows, 1);
  assert.deepEqual(parsed.records, [
    { name: "Valid Ref", country: "England", games: 3, wins: 2, losses: 0, draws: 1 },
  ]);
});

test("parses Argentina World Cup referees from FBref HTML and markdown", () => {
  const content = `<table><tbody>
    <tr><td data-stat="referee"><a>Szymon Marciniak</a></td></tr>
    <tr><td data-stat="referee">Amin Omar</td></tr>
  </tbody></table>
  | Date | Opponent | Referee | Match Report |
  | --- | --- | --- | --- |
  | 2026-06-16 | Algeria | Szymon Marciniak | Match Report |
  | 2026-06-27 | Jordan | Istvan Kovacs | Match Report |`;

  assert.deepEqual(parseArgentinaWorldCup2026Referees(content), [
    "Szymon Marciniak",
    "Amin Omar",
    "Istvan Kovacs",
  ]);
});
