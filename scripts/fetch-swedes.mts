/**
 * Hämtar svenskarnas matcher i pågående turneringar → public/data/swedes.json.
 *
 * Medvetet separat från fetch-data.mts: det här jobbet är litet (en handfull
 * anrop) och körs tätt under turneringsdagar, medan rankingjobbet gör hundratals
 * anrop och bara behöver köras nattetid.
 *
 *   npm run fetch:swedes [-- --out <fil>]
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fetchBracket, fetchCalendar, fetchLiveMatchCodes, fetchMatchCards, pool, type RawCalendarRow } from "./wtt-api.ts";
import {
  buildSwedeMatches,
  compareMatches,
  deriveOffsetMinutes,
  normalizeCode,
  paddedCode,
  type RawBracket,
  type RawMatchCard,
} from "./swedes-model.ts";
import type { SwedeEvent, SwedeSubEvent, SwedesData } from "../src/swedes/types.ts";

const SUB_EVENTS: Array<[SwedeSubEvent, string]> = [
  ["MS", "MSINGLES"],
  ["WS", "WSINGLES"],
  ["MD", "MDOUBLES"],
  ["WD", "WDOUBLES"],
  ["XD", "XDOUBLES"],
];

const DAY = 86_400_000;
/** Matcher som borde ha börjat men saknar resultat kollas upp en och en. */
const LIVE_WINDOW_MS = 6 * 3_600_000;

// Sista skyddsnätet: hänger något sig trots alla tidsgränser avslutar vi hellre med
// ett fel (och låter nästa körning försöka) än blockerar kön.
setTimeout(() => {
  console.error("Tog för lång tid — avbryter.");
  process.exit(1);
}, 150_000).unref();

const outArg = process.argv.indexOf("--out");
const OUT = resolve(outArg > 0 ? process.argv[outArg + 1] : "public/data/swedes.json");

/** Seniorturneringar vars datumintervall (med en dags marginal) innehåller idag. */
function activeEvents(rows: RawCalendarRow[], now: number): RawCalendarRow[] {
  return rows.filter((r) => {
    const start = Date.parse(r.StartDateTime ?? r.FromStartDate ?? "");
    const end = Date.parse(r.EndDateTime ?? r.FromEndDate ?? "");
    if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
    if (/youth|veteran|multi-sport|qualification/i.test(r.EventType)) return false;
    return now >= start - DAY && now <= end + 2 * DAY;
  });
}

async function eventWithSwedes(row: RawCalendarRow, now: number): Promise<SwedeEvent | null> {
  const brackets = await Promise.all(
    SUB_EVENTS.map(async ([sub, code]) => ({ sub, bracket: (await fetchBracket(row.EventId, code)) as RawBracket | null })),
  );
  const present = brackets.filter((b) => b.bracket?.Competition?.Bracket?.length);
  if (!present.length) return null;

  const cards = new Map<string, RawMatchCard>();
  for (const c of (await fetchMatchCards(row.EventId)) as RawMatchCard[]) {
    cards.set(normalizeCode(c.documentCode), c);
  }
  const offsetMin = deriveOffsetMinutes(cards.values());
  const liveIds = await fetchLiveMatchCodes(row.EventId);

  const build = () =>
    present.flatMap(({ sub, bracket }) => buildSwedeMatches({ sub, bracket: bracket!, cards, offsetMin, liveIds }));
  const buildAll = () => build().sort(compareMatches);
  let matches = buildAll();

  // Pågående matcher finns inte bland de officiella korten än. Fråga efter dem
  // enskilt — samma väg som WTT:s egen sajt tar för sin live-vy.
  const maybeLive = matches.filter((m) => {
    if (m.status === "won" || m.status === "lost") return false;
    const start = m.startUtc ? Date.parse(m.startUtc) : NaN;
    return Number.isFinite(start) && start <= now && now - start <= LIVE_WINDOW_MS;
  });
  if (maybeLive.length) {
    const live = await pool(maybeLive, 4, (m) => fetchMatchCards(row.EventId, paddedCode(m.id)).catch(() => []));
    for (const card of live.flat() as RawMatchCard[]) cards.set(normalizeCode(card.documentCode), card);
    matches = buildAll();
  }

  if (!matches.length) return null;
  return {
    id: row.EventId,
    name: row.EventName,
    city: row.City,
    country: row.Country,
    start: (row.StartDateTime ?? row.FromStartDate ?? "").slice(0, 10),
    end: (row.EndDateTime ?? row.FromEndDate ?? "").slice(0, 10),
    matches,
  };
}

async function main() {
  const now = Date.now();
  const year = new Date(now).getUTCFullYear();
  // Runt nyår kan en turnering ligga i förra årets kalender.
  const rows = [...(await fetchCalendar(year)), ...(new Date(now).getUTCMonth() === 0 ? await fetchCalendar(year - 1) : [])];

  const active = activeEvents(rows, now);
  console.log(`Aktiva turneringar: ${active.map((r) => r.EventName).join(", ") || "inga"}`);

  const events: SwedeEvent[] = [];
  for (const row of active) {
    try {
      const ev = await eventWithSwedes(row, now);
      if (ev) {
        events.push(ev);
        console.log(`  ${ev.name}: ${ev.matches.length} svenska matcher`);
      }
    } catch (err) {
      // En trasig turnering ska inte stoppa de andra, och inte heller publiceringen.
      console.warn(`  ${row.EventName}: hoppar över (${(err as Error).message})`);
    }
  }

  const data: SwedesData = { generatedAt: new Date(now).toISOString(), events };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(data, null, 1) + "\n");
  console.log(`Skrev ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
