/**
 * Ren omvandling: WTT:s lottning (brackets) + färdiga matchkort → svenskarnas matcher.
 *
 * Inget nätverk här, så att allt går att testa mot små fixtures.
 *
 * Lottningen är skelettet. Den innehåller varje match i en gren — vem som möter vem,
 * tid när WTT satt en, och vilken match vinnaren går vidare till. Men den är en cache
 * som ligger efter: den kan visa en match som pågående långt efter att den är slut.
 * De officiella matchkorten är sanningen om färdigspelade matcher och överstyr
 * lottningen så fort de finns.
 */
import type { MatchSide, SwedeMatch, SwedeMatchStatus, SwedeSubEvent } from "../src/swedes/types.ts";

// ---------------------------------------------------------------------------
// Råformat (bara de fält vi läser)
// ---------------------------------------------------------------------------

export interface RawAthlete {
  Code?: string;
  Description?: { GivenName?: string; FamilyName?: string; Organization?: string };
}

export interface RawCompetitor {
  Code: string;
  Organization?: string;
  Description?: { TeamName?: string };
  Composition?: { Athlete?: RawAthlete[] };
}

export interface RawPlace {
  Code: string;
  Pos: number;
  Wlt?: string | null;
  Result?: string | null;
  PreviousUnit?: { Unit: string | null; Wlt?: string | null } | null;
  Competitor: RawCompetitor | null;
}

export interface RawBracketItem {
  Unit: string;
  Date: string | null;
  Time: string | null;
  Result?: string | null;
  CompetitorPlace: RawPlace[];
}

export interface RawBracket {
  Competition?: {
    Bracket?: Array<{
      Code: string;
      BracketItems: Array<{ Code: string; BracketItem: RawBracketItem[] }>;
    }>;
  };
}

export interface RawMatchCard {
  documentCode: string;
  competitiors: Array<{
    competitiorId: string;
    scores?: string;
  }>;
  gameScores?: string;
  overallScores?: string;
  resultStatus?: string;
  tableName?: string;
  tableNumber?: string;
  matchDateTime?: { startDateLocal?: string; startDateUTC?: string } | null;
}

// ---------------------------------------------------------------------------
// Hjälpare
// ---------------------------------------------------------------------------

/** Matchkoder kommer med olika mängd utfyllnad ("----") beroende på källa. */
export const normalizeCode = (code: string) => code.replace(/-+$/, "");

/** Ordning som kortens egna dokumentkoder har: 42 tecken. Behövs vid uppslag per match. */
export const paddedCode = (unit: string) => unit.padEnd(42, "-");

/**
 * Namn på svenskar vars namn WTT skriver utan diakritiska tecken, eller med
 * formellt förnamn. Lista över kända namn; allt annat får en generell skiftlägesfix.
 */
const NAME_OVERRIDES: Record<string, string> = {
  "KALLBERG Anton": "Anton Källberg",
  "KALLBERG Christina": "Stina Källberg",
  "MOREGARD Truls": "Truls Möregårdh",
  "KARLSSON Kristian": "Kristian Karlsson",
  "KARLSSON Mattias": "Mattias Karlsson",
  "RANEFUR Elias": "Elias Ranefur",
  "FALCK Mattias": "Mattias Falck",
  "PERSSON Jon": "Jon Persson",
  "BERGSTROM Linda": "Linda Bergström",
  "BERGAND Filippa": "Filippa Bergand",
  "EKHOLM Matilda": "Matilda Ekholm",
  "LUNDQVIST Felix": "Felix Lundqvist",
  "WESTERBERG Jonathan": "Jonathan Westerberg",
  "BRODD Viktor": "Viktor Brodd",
  "ERIKSSON Hanna": "Hanna Eriksson",
};

const titleCase = (s: string) =>
  s.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());

export function prettyName(given: string, family: string): string {
  const key = `${family.trim()} ${given.trim()}`;
  return NAME_OVERRIDES[key] ?? `${titleCase(given.trim())} ${titleCase(family.trim())}`.trim();
}

/** "KARLSSON Kristian" när bara lagnamnet finns (ingen athlete-lista). */
function prettyFromTeamName(teamName: string): string {
  const [first, ...rest] = teamName.split(" ");
  // Mönstret är "FAMILJ Förnamn": versaler först.
  return rest.length ? prettyName(rest.join(" "), first) : titleCase(teamName);
}

export function sideOf(c: RawCompetitor | null): MatchSide | null {
  if (!c) return null;
  const athletes = c.Composition?.Athlete ?? [];
  if (athletes.length) {
    return {
      names: athletes.map((a) => prettyName(a.Description?.GivenName ?? "", a.Description?.FamilyName ?? "")),
      orgs: athletes.map((a) => a.Description?.Organization ?? c.Organization ?? ""),
    };
  }
  const team = c.Description?.TeamName;
  return { names: team ? [prettyFromTeamName(team)] : ["?"], orgs: [c.Organization ?? ""] };
}

export const isSwedish = (c: RawCompetitor | null): boolean =>
  !!c &&
  (c.Organization === "SWE" ||
    (c.Composition?.Athlete ?? []).some((a) => a.Description?.Organization === "SWE"));

/** Placeringskod som appens positionLabel förstår. */
function roundCode(stage: string, itemCode: string): string {
  if (stage === "PREL") return "QR"; // kvalet delas inte upp i appens placeringsspråk
  const c = itemCode.replace(/-+$/, "");
  const map: Record<string, string> = {
    R128: "R128", R64: "R64", R32: "R32", "8FNL": "R16", QFNL: "QF", SFNL: "SF", FNL: "F",
  };
  return map[c] ?? c;
}

/** "MM/DD/YYYY HH:mm:ss" → ISO UTC. */
function parseUsDate(s: string | undefined): string | null {
  const m = s?.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/);
  return m ? `${m[3]}-${m[1]}-${m[2]}T${m[4]}:${m[5]}:${m[6]}Z` : null;
}

/**
 * Turneringens avvikelse från UTC i minuter, härledd ur ett färdigt matchkort
 * (kortet bär både lokal tid och UTC). Null om inga kort finns än.
 */
export function deriveOffsetMinutes(cards: Iterable<RawMatchCard>): number | null {
  for (const card of cards) {
    const local = card.matchDateTime?.startDateLocal;
    const utc = card.matchDateTime?.startDateUTC;
    const l = parseUsDate(local);
    const u = parseUsDate(utc);
    if (l && u) return Math.round((Date.parse(l) - Date.parse(u)) / 60000);
  }
  return null;
}

const toLocalIso = (date: string | null, time: string | null) =>
  date && time ? `${date}T${time.slice(0, 5)}` : null;

const localToUtc = (local: string | null, offsetMin: number | null): string | null => {
  if (!local || offsetMin === null) return null;
  return new Date(Date.parse(`${local}:00Z`) - offsetMin * 60000).toISOString();
};

const parseGames = (s: string | undefined): Array<[number, number]> =>
  (s ?? "")
    .split(",")
    .map((g) => g.split("-").map(Number) as [number, number])
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && (a > 0 || b > 0));

// ---------------------------------------------------------------------------
// Själva omvandlingen
// ---------------------------------------------------------------------------

interface Flat {
  stage: string;
  round: string;
  item: RawBracketItem;
}

interface Outcome {
  status: "won" | "lost" | "live" | "open";
  sets: [number, number] | null;
  games: Array<[number, number]> | null;
}

/** Utfall ur matchkortet, orienterat så att `swedeId` kommer först. */
function outcomeFromCard(card: RawMatchCard, swedeId: string): Outcome | null {
  const idx = card.competitiors.findIndex((c) => String(c.competitiorId) === swedeId);
  if (idx < 0) return null;
  const swedeIsHome = idx === 0;
  const orient = <T extends [number, number]>(pair: T): [number, number] => (swedeIsHome ? pair : [pair[1], pair[0]]);

  const overall = card.overallScores?.split("-").map(Number) ?? [];
  const sets: [number, number] | null =
    overall.length === 2 && overall.every(Number.isFinite) ? orient([overall[0], overall[1]]) : null;
  const games = parseGames(card.gameScores).map((g) => orient(g));

  const official = (card.resultStatus ?? "").toUpperCase() === "OFFICIAL";
  if (official && sets && sets[0] !== sets[1]) {
    return { status: sets[0] > sets[1] ? "won" : "lost", sets, games };
  }
  if (!official && (games.length || (sets && (sets[0] || sets[1])))) {
    return { status: "live", sets, games };
  }
  return null;
}

/** Utfall ur lottningens egna fält — reserv när inget matchkort finns. */
function outcomeFromBracket(item: RawBracketItem, swedePlace: RawPlace, oppPlace: RawPlace | undefined): Outcome | null {
  const wlt = swedePlace.Wlt;
  const swedeSets = Number(swedePlace.Result);
  const oppSets = Number(oppPlace?.Result);
  const sets: [number, number] | null =
    Number.isFinite(swedeSets) && Number.isFinite(oppSets) && swedePlace.Result != null && oppPlace?.Result != null
      ? [swedeSets, oppSets]
      : null;

  // Result-strängen "3-1 (8:11,6:11,…)" ligger i plats 1–plats 2-ordning.
  const games: Array<[number, number]> = [];
  const m = item.Result?.match(/\(([^)]*)\)/);
  if (m) {
    for (const g of m[1].split(",")) {
      const [a, b] = g.split(":").map(Number);
      if (Number.isFinite(a) && Number.isFinite(b) && (a > 0 || b > 0)) {
        games.push(swedePlace.Pos === 1 ? [a, b] : [b, a]);
      }
    }
  }

  if (wlt === "W" || wlt === "L") return { status: wlt === "W" ? "won" : "lost", sets, games };
  // Resultat men ingen vinnare: matchen pågår, eller så är cachen en ögonblicksbild.
  if (item.Result && item.Result.trim() !== "") return { status: "live", sets: null, games };
  return null;
}

export interface BuildInput {
  sub: SwedeSubEvent;
  bracket: RawBracket;
  /** Färdiga/pågående matchkort per normaliserad matchkod. */
  cards: Map<string, RawMatchCard>;
  /** Turneringens UTC-avvikelse i minuter. Null = okänd. */
  offsetMin: number | null;
  /** Matchkoder som WTT just nu listar som pågående. */
  liveIds?: Set<string>;
}

export function buildSwedeMatches({ sub, bracket, cards, offsetMin, liveIds }: BuildInput): SwedeMatch[] {
  const live = liveIds && new Set([...liveIds].map(normalizeCode));
  const flat: Flat[] = [];
  for (const b of bracket.Competition?.Bracket ?? []) {
    for (const ri of b.BracketItems ?? []) {
      for (const item of ri.BracketItem ?? []) {
        flat.push({ stage: b.Code, round: roundCode(b.Code, ri.Code), item });
      }
    }
  }
  const byUnit = new Map(flat.map((f) => [normalizeCode(f.item.Unit), f]));

  const out: SwedeMatch[] = [];
  const seen = new Set<string>();

  const sideForPlace = (place: RawPlace | undefined): { side: MatchSide | null; from: MatchSide[] | null } => {
    if (!place) return { side: null, from: null };
    if (place.Competitor) return { side: sideOf(place.Competitor), from: null };
    // Okänd motståndare: visa vilka två som spelar matchen som avgör det.
    const prev = place.PreviousUnit?.Unit ? byUnit.get(normalizeCode(place.PreviousUnit.Unit)) : undefined;
    const cands = prev
      ? prev.item.CompetitorPlace.map((p) => sideOf(p.Competitor)).filter((s): s is MatchSide => !!s)
      : [];
    return { side: null, from: cands.length === 2 ? cands : null };
  };

  const make = (f: Flat, swedePlace: RawPlace, outcomeOverride?: Outcome | null): SwedeMatch => {
    const id = normalizeCode(f.item.Unit);
    const oppPlace = f.item.CompetitorPlace.find((p) => p !== swedePlace);
    const card = cards.get(id);
    const swedeId = swedePlace.Competitor?.Code ?? swedePlace.Code;

    const outcome =
      outcomeOverride ??
      (card ? outcomeFromCard(card, swedeId) : null) ??
      outcomeFromBracket(f.item, swedePlace, oppPlace);

    // Tid: kortets exakta UTC-tid först, annars lottningens lokala tid + avvikelse.
    const startLocal = toLocalIso(f.item.Date, f.item.Time) ?? card?.matchDateTime?.startDateLocal?.replace(
      /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}:\d{2}).*$/, "$3-$1-$2T$4") ?? null;
    const startUtc = parseUsDate(card?.matchDateTime?.startDateUTC) ?? localToUtc(startLocal, offsetMin);

    const opp = sideForPlace(oppPlace);
    let status: SwedeMatchStatus;
    if (outcome && outcome.status !== "open") status = outcome.status;
    else if (live?.has(id)) status = "live"; // listad som pågående, även om ställningen saknas
    else if (!startLocal || !opp.side) status = "tbd";
    else status = "scheduled";

    return {
      id,
      sub,
      round: f.round,
      qualifying: f.stage === "PREL",
      swedes: sideOf(swedePlace.Competitor)!,
      opponent: opp.side,
      opponentFrom: opp.side ? null : opp.from,
      status,
      startUtc: startUtc ? startUtc.replace(/\.\d{3}Z$/, "Z") : null,
      startLocal,
      table: card?.tableName ?? null,
      // En match som just startat har ett kort men ingen poäng än: visa 0–0 hellre än inget.
      sets: outcome?.sets ?? (status === "live" && card ? ([0, 0] as [number, number]) : null),
      games: outcome?.games?.length ? outcome.games : null,
    };
  };

  // 1) Varje match i lottningen där en svensk står med.
  for (const f of flat) {
    const swedePlace = f.item.CompetitorPlace.find((p) => isSwedish(p.Competitor));
    if (!swedePlace) continue;
    const id = normalizeCode(f.item.Unit);
    seen.add(id);
    out.push(make(f, swedePlace));
  }

  // 2) Lottningen ligger ibland efter: en svensk har vunnit sin match men står inte
  //    ännu i nästa. Lägg till nästa match som "ej fastställd".
  for (const m of [...out]) {
    if (m.status !== "won") continue;
    const here = byUnit.get(m.id);
    if (!here) continue;
    const next = flat.find((f) =>
      f.item.CompetitorPlace.some((p) => p.PreviousUnit?.Unit && normalizeCode(p.PreviousUnit.Unit) === m.id));
    if (!next || seen.has(normalizeCode(next.item.Unit))) continue;

    const incoming = next.item.CompetitorPlace.find(
      (p) => p.PreviousUnit?.Unit && normalizeCode(p.PreviousUnit.Unit) === m.id,
    )!;
    const swedeFromHere = here.item.CompetitorPlace.find((p) => isSwedish(p.Competitor));
    if (!swedeFromHere?.Competitor) continue;

    // Bygg en syntetisk plats med svensken på den plats som tar emot vinnaren.
    const place: RawPlace = { ...incoming, Competitor: swedeFromHere.Competitor, Code: swedeFromHere.Code };
    seen.add(normalizeCode(next.item.Unit));
    out.push(make(next, place, { status: "open", sets: null, games: null }));
  }

  return out.sort(compareMatches);
}

/** Tidsordning med okända tider sist, sedan lottningens egen ordning. */
export function compareMatches(a: SwedeMatch, b: SwedeMatch): number {
  const ta = a.startUtc ?? a.startLocal;
  const tb = b.startUtc ?? b.startLocal;
  if (ta && tb) return ta < tb ? -1 : ta > tb ? 1 : a.id.localeCompare(b.id);
  if (ta) return -1;
  if (tb) return 1;
  return a.id.localeCompare(b.id);
}
