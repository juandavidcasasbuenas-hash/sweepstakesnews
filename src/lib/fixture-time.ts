import type { Fixture } from "@/types/game";

export function fixtureKickoffDate(fixture: Pick<Fixture, "date" | "time">) {
  const match = fixture.time.match(/^(\d{1,2}):(\d{2}) UTC([+-]\d{1,2})$/);
  if (!match) return null;

  const [, hour, minute, offset] = match;
  const utcMs =
    Date.UTC(
      Number(fixture.date.slice(0, 4)),
      Number(fixture.date.slice(5, 7)) - 1,
      Number(fixture.date.slice(8, 10)),
      Number(hour),
      Number(minute),
    ) -
    Number(offset) * 60 * 60 * 1000;

  return new Date(utcMs);
}
