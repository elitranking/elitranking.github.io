/**
 * Hämtar all data appen behöver och skriver statiska JSON-filer till public/data/.
 *
 * Körs i GitHub Actions varje natt. Anledningen till att den inte kan köras i
 * webbläsaren är CORS: WTT:s gateway släpper bara igenom anrop med Origin från
 * deras egen domän. Att förbereda datan i CI ger dessutom en sajt som laddar
 * på ett par hundra kilobyte utan ett enda API-anrop.
 */
import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  fetchRanking, fetchBreakdown, fetchCalendar, fetchEntries, fetchEventPoints,
  pool, type RawBreakdownRow, type RawCalendarRow,
} from "./wtt-api.js";
import { isoWeek, addWeeks } from "../src/engine/week.js";
import { pointsAt } from "../src/engine/ranking.js";
import { classifyEvent } from "../src/engine/rules.js";
import type {
  DataBundle, Player, PlayerResult, PointsSchedule, SubEvent, TournamentEvent, Week,
} from "../src/engine/types.js";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "data");
const SUB_EVENTS: SubEvent[] = ["MS", "WS"];
const DEPTH = Number(process.env.RANKING_DEPTH ?? 250);

/** Placeringar i den ordning de ska visas i gränssnittet. */
const POSITION_ORDER = ["W", "F", "SF", "QF", "R16", "R32", "R64", "R128", "DNP"];

const log = (...a: unknown[]) => console.log("›", ...a);

// ---------------------------------------------------------------------------

async function main() {
  const t0 = Date.now();

  // --- Kalender först: klassificeringen av turneringar behövs för poängreglerna
  const calendar: RawCalendarRow[] = [];
  const thisYear = new Date().getFullYear();
  for (const y of [thisYear - 2, thisYear - 1, thisYear, thisYear + 1]) {
    try {
      const rows = await fetchCalendar(y);
      if (rows.length) { calendar.push(...rows); log(`kalender ${y}: ${rows.length}`); }
    } catch { /* framtida år finns inte alltid */ }
  }
  if (!calendar.length) throw new Error("Ingen kalenderdata — kan inte klassificera turneringar");
  const eventTypeById = new Map(calendar.map((e) => [e.EventId, e.EventType]));

  // --- Ranking + poängbreakdown -------------------------------------------
  const rankings = {} as Record<SubEvent, Player[]>;
  // Motorns egen självkontroll mot WTT:s publicerade poäng, sparad i meta.json
  // så att sajten kan säga ifrån om modellen och verkligheten glider isär.
  const quality = {} as Record<SubEvent, { checked: number; mismatched: number }>;
  const allResults: RawBreakdownRow[] = [];
  let week!: Week;
  let publishDate = "";

  for (const sub of SUB_EVENTS) {
    const rows = await fetchRanking(sub, DEPTH);
    if (!rows.length) throw new Error(`Tom ranking för ${sub}`);

    week = { year: +rows[0].RankingYear, week: +rows[0].RankingWeek };
    publishDate = toIsoDate(rows[0].PublishDate);
    log(`${sub}: ${rows.length} spelare, vecka ${week.week}/${week.year}`);

    const month = +rows[0].RankingMonth;
    const breakdowns = await pool(rows, 5, async (p, i) => {
      if (i % 50 === 0 && i) log(`  breakdown ${i}/${rows.length}`);
      return fetchBreakdown(p.IttfId, sub, { ...week, month });
    });

    rankings[sub] = rows.map((p, i) => {
      const raw = breakdowns[i] ?? [];
      allResults.push(...raw);
      return {
        id: p.IttfId,
        name: p.PlayerName,
        country: p.CountryCode,
        rank: Number(p.CurrentRank),
        previousRank: Number(p.PreviousRank),
        officialPoints: Number(p.RankingPointsYTD),
        results: raw.map((r) => toResult(r, eventTypeById)).sort((a, b) => b.points - a.points),
      } satisfies Player;
    });

    quality[sub] = verify(sub, rankings[sub], week);
  }

  // Vilka turneringstyper ger faktiskt rankingpoäng? Härled ur verkliga resultat
  // istället för att hårdkoda en lista som WTT kan ändra.
  const scoringTypes = new Set<string>();
  for (const r of allResults) {
    const t = eventTypeById.get(r.EventId);
    if (t && r.RankingPoints > 0) scoringTypes.add(t);
  }
  log(`poänggivande turneringstyper: ${[...scoringTypes].join(", ")}`);

  // Poängtabeller per typ, observerade ur faktiska resultat
  const schedulesByType = deriveSchedules(allResults, eventTypeById);

  // --- Kommande turneringar ------------------------------------------------
  const today = new Date().toISOString().slice(0, 10);
  // Ungdomsturneringar ger seniorpoäng till unga spelare, men de hör inte hemma
  // i ett verktyg om världseliten — de skulle dränka listan utan att flytta toppen.
  const upcoming = calendar
    .filter((e) => scoringTypes.has(e.EventType) && !classifyEvent(e.EventType, e.EventName).youth)
    .map((e) => ({ e, start: dateOf(e, "start"), end: dateOf(e, "end") }))
    .filter((x) => x.end && x.end >= today)
    .sort((a, b) => a.start!.localeCompare(b.start!))
    .slice(0, 25);

  log(`${upcoming.length} kommande poänggivande turneringar`);

  const events: TournamentEvent[] = await pool(upcoming, 4, async ({ e, start, end }) => {
    const published = await fetchEventPoints(e.EventId).catch(() => []);
    const official = scheduleFromPublished(published);
    const entries = await loadEntries(e.EventId);
    return {
      ...classifyEvent(e.EventType, e.EventName),
      id: e.EventId,
      name: cleanName(e.EventName),
      type: e.EventType,
      city: e.City ?? "",
      country: e.Country ?? "",
      start: start!,
      end: end!,
      landsIn: addWeeks(isoWeek(new Date(end!)), 1),
      points: official ?? schedulesByType[e.EventType] ?? {},
      pointsAreEstimated: !official,
      entries,
    } satisfies TournamentEvent;
  });

  // --- Skriv ---------------------------------------------------------------
  const bundle: DataBundle = {
    meta: { generatedAt: new Date().toISOString(), week, publishDate, quality },
    rankings,
    events,
  };

  await mkdir(OUT, { recursive: true });
  await writeFile(join(OUT, "meta.json"), JSON.stringify(bundle.meta));
  await writeFile(join(OUT, "events.json"), JSON.stringify(events));
  for (const sub of SUB_EVENTS) {
    await writeFile(join(OUT, `ranking-${sub}.json`), JSON.stringify(rankings[sub]));
  }
  log(`klart på ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

// ---------------------------------------------------------------------------

function toResult(r: RawBreakdownRow, typeById: Map<number, string>): PlayerResult {
  return {
    ...classifyEvent(typeById.get(r.EventId), r.EventName),
    eventId: r.EventId,
    eventName: cleanName(r.EventName),
    position: r.ResultPosition,
    points: r.RankingPoints,
    earned: { year: r.RankingYear, week: r.RankingWeek },
    expires: { year: r.ExpiryYear, week: r.ExpiryWeek },
  };
}

/** WTT:s namn släpar ofta sponsorled och dubbla mellanslag. */
function cleanName(n: string): string {
  return n
    .replace(/\s+Presented by.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function toIsoDate(usDate: string): string {
  const [mm, dd, yy] = usDate.split(" ")[0].split("/").map(Number);
  return `${yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

function dateOf(e: RawCalendarRow, which: "start" | "end"): string | null {
  const v = which === "start"
    ? e.StartDateTime ?? e.FromStartDate
    : e.EndDateTime ?? e.FromEndDate;
  return v ? v.slice(0, 10) : null;
}

/**
 * Bygger poängtabeller per turneringstyp genom att observera vad spelare
 * faktiskt fick för respektive placering. Mer robust än en hårdkodad tabell:
 * ändrar WTT poängen så följer appen med automatiskt vid nästa körning.
 */
function deriveSchedules(
  results: RawBreakdownRow[],
  typeById: Map<number, string>,
): Record<string, PointsSchedule> {
  // typ -> placering -> senast sedda (år,vecka) och poäng
  const seen = new Map<string, Map<string, { week: number; points: number }>>();

  for (const r of results) {
    const type = typeById.get(r.EventId);
    // Hoppa över lagtävlingar ("W-48%") och nollresultat
    if (!type || !/^[A-Z0-9]+$/.test(r.ResultPosition) || r.RankingPoints <= 0) continue;
    const abs = r.RankingYear * 52 + r.RankingWeek;
    const byPos = seen.get(type) ?? new Map();
    const prev = byPos.get(r.ResultPosition);
    if (!prev || abs > prev.week) byPos.set(r.ResultPosition, { week: abs, points: r.RankingPoints });
    seen.set(type, byPos);
  }

  const out: Record<string, PointsSchedule> = {};
  for (const [type, byPos] of seen) {
    const schedule: PointsSchedule = {};
    for (const pos of POSITION_ORDER) {
      const hit = byPos.get(pos);
      if (hit) schedule[pos] = hit.points;
    }
    schedule.DNP = 0;
    out[type] = schedule;
  }
  return out;
}

const PLACE_TO_POSITION: Record<string, string> = {
  champion: "W", winner: "W", finalist: "F", "runner-up": "F",
  semifinals: "SF", semifinalist: "SF", semi: "SF",
  quarterfinals: "QF", quarterfinalist: "QF", quarter: "QF",
  "round of 16": "R16", "round of 32": "R32", "round of 64": "R64", "round of 128": "R128",
};

function scheduleFromPublished(
  rows: Array<{ subEventName: string; place: string; points: string }>,
): PointsSchedule | null {
  const singles = rows.filter((r) => /singles/i.test(r.subEventName));
  if (!singles.length) return null;
  const out: PointsSchedule = {};
  for (const r of singles) {
    const key = PLACE_TO_POSITION[r.place.trim().toLowerCase()];
    const pts = Number(String(r.points).replace(/[^\d]/g, ""));
    if (key && Number.isFinite(pts)) out[key] = pts;
  }
  if (!Object.keys(out).length) return null;
  out.DNP = 0;
  return out;
}

async function loadEntries(eventId: number) {
  try {
    const rows = await fetchEntries(eventId);
    const out: Partial<Record<SubEvent, string[]>> = {};
    for (const sub of SUB_EVENTS) {
      const ids = rows
        .filter((r) => r.SubEventCode === sub && !/withdraw|cancel/i.test(r.Status ?? ""))
        .map((r) => String(r.ittfid));
      if (ids.length) out[sub] = [...new Set(ids)];
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

/** Sanity check: motorns bästa-8 måste ge exakt WTT:s officiella poäng. */
function verify(sub: SubEvent, players: Player[], week: Week): { checked: number; mismatched: number } {
  let bad = 0;
  let checked = 0;
  for (const p of players) {
    if (!p.results.length) continue;
    checked++;
    const { points } = pointsAt(p.results, week);
    if (points !== p.officialPoints) {
      if (bad < 5) console.warn(`  ⚠︎ ${sub} ${p.name}: motor ${points} ≠ officiellt ${p.officialPoints}`);
      bad++;
    }
  }
  if (bad) console.warn(`  ⚠︎ ${sub}: ${bad}/${checked} avvikelser mot officiella poäng`);
  else log(`  ✓ ${sub}: alla ${checked} spelare stämmer exakt`);
  return { checked, mismatched: bad };
}

await main();
