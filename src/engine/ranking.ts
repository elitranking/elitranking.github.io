/**
 * Rankingmotorn. Rena funktioner, inga beroenden — allt som är svårt att lita på
 * i den här appen bor här och är enhetstestat mot verklig data från WTT.
 *
 * Reglerna, empiriskt verifierade mot API:et:
 *
 *   • Ett resultat är giltigt från veckan det landar till och med veckan innan
 *     det faller ur, exakt 52 veckor senare.
 *   • Rankingpoäng = summan av spelarens 8 bästa giltiga resultat.
 *
 * Den andra regeln är den som gör hela appen värd att bygga. Alla räknar
 * "nuvarande poäng minus försvarspoäng", men om det försvarade resultatet
 * ersätts av spelarens nionde bästa så backar hen mindre än man tror. Det är
 * skillnaden mellan att förlora förstaplatsen och att behålla den.
 */
import type { Player, PlayerResult, ScenarioPick, TournamentEvent, Week } from "./types";
import { compareWeeks, expiryWeek, weekOf } from "./week";
import { LIMITS, ZERO_POINT_PARTICIPATION } from "./rules";

/** Antal resultat som räknas. WTT använder bästa 8 (§1.9). */
export const COUNTING_RESULTS = 8;

export interface PointsBreakdown {
  points: number;
  /** De resultat som faktiskt räknas, i fallande poängordning. */
  counting: PlayerResult[];
  /** Giltiga resultat utanför de åtta — spelarens skyddsnät. */
  reserve: PlayerResult[];
  /** Resultat som stängdes ute av ett tak snarare än av för låg poäng. */
  blocked: PlayerResult[];
}

/** Är resultatet giltigt vid veckan `at`? */
export function isActive(result: PlayerResult, at: Week): boolean {
  return compareWeeks(result.earned, at) <= 0 && compareWeeks(at, result.expires) < 0;
}

/**
 * Poäng vid en godtycklig vecka.
 *
 * Urvalet är inte bara "de åtta högsta". Tre saker kan flytta ett resultat ur
 * bästa 8 trots att poängen räcker:
 *
 *   • bara ett kontinentalt resultat får räknas (§1.9.1)
 *   • bara fyra ungdomsresultat får räknas (§1.9.2)
 *   • ZPP-resultat tar en plats trots noll poäng
 *
 * Sorteringen är stabil på (poäng, tidigast intjänad) så att lika poäng alltid
 * ger samma svar — annars kunde två körningar ge olika what-if-utfall.
 */
export function pointsAt(results: readonly PlayerResult[], at: Week): PointsBreakdown {
  const active = results.filter((r) => isActive(r, at));

  // ZPP tar sina platser först, oavsett poäng
  const forced = active.filter((r) => r.position === ZERO_POINT_PARTICIPATION);
  const candidates = active
    .filter((r) => r.position !== ZERO_POINT_PARTICIPATION)
    .sort((a, b) => b.points - a.points || weekOf(a.earned) - weekOf(b.earned));

  const counting: PlayerResult[] = forced.slice(0, COUNTING_RESULTS);
  const reserve: PlayerResult[] = [];
  const blocked: PlayerResult[] = [];
  let continental = 0;
  let youth = 0;

  for (const result of candidates) {
    if (counting.length >= COUNTING_RESULTS) {
      reserve.push(result);
      continue;
    }
    if (result.continental && continental >= LIMITS.continental) {
      blocked.push(result);
      continue;
    }
    if (result.youth && youth >= LIMITS.youth) {
      blocked.push(result);
      continue;
    }
    if (result.continental) continental++;
    if (result.youth) youth++;
    counting.push(result);
  }

  counting.sort((a, b) => b.points - a.points || weekOf(a.earned) - weekOf(b.earned));

  return {
    points: counting.reduce((sum, r) => sum + r.points, 0),
    counting,
    reserve,
    blocked,
  };
}

/** Gör om ett användarval till ett resultat i spelarens poängkonto. */
export function pickToResult(pick: ScenarioPick, event: TournamentEvent): PlayerResult | null {
  const points = event.points[pick.position];
  if (points === undefined) return null;
  return {
    eventId: event.id,
    eventName: event.name,
    position: pick.position,
    points,
    earned: event.landsIn,
    expires: expiryWeek(event.landsIn),
    continental: event.continental,
    youth: event.youth,
  };
}

export interface ProjectedPlayer {
  player: Player;
  /** Placering i den projicerade rankingen. */
  rank: number;
  points: number;
  /** Placering och poäng i dag, för jämförelse. */
  currentRank: number;
  currentPoints: number;
  pointsDelta: number;
  /** Positivt = klättrat. */
  rankDelta: number;
  counting: PlayerResult[];
  /** Resultat som faller ur mellan i dag och målveckan. */
  expiring: PlayerResult[];
  /** Nya resultat från scenariot som faktiskt räknas. */
  gained: PlayerResult[];
}

export interface ProjectionInput {
  players: readonly Player[];
  events: readonly TournamentEvent[];
  picks: readonly ScenarioPick[];
  /** Veckan rankingen står i i dag. */
  now: Week;
  /** Veckan vi projicerar till. */
  target: Week;
}

/**
 * Projicerar hela rankinglistan till en framtida vecka.
 *
 * Turneringar som ligger mellan `now` och `target` men saknar val ger inga nya
 * poäng — det är medvetet. Motorn gissar aldrig åt användaren; utgående poäng
 * försvinner däremot alltid, för det gör de i verkligheten oavsett vad någon tror.
 */
export function project({ players, events, picks, now, target }: ProjectionInput): ProjectedPlayer[] {
  const eventById = new Map(events.map((e) => [e.id, e]));

  // Val grupperade per spelare, bara för turneringar som hunnit landa i målveckan
  const picksByPlayer = new Map<string, PlayerResult[]>();
  for (const pick of picks) {
    const event = eventById.get(pick.eventId);
    if (!event || compareWeeks(event.landsIn, target) > 0) continue;
    const result = pickToResult(pick, event);
    if (!result || result.points <= 0) continue;
    const list = picksByPlayer.get(pick.playerId) ?? [];
    list.push(result);
    picksByPlayer.set(pick.playerId, list);
  }

  const projected = players.map((player) => {
    const added = picksByPlayer.get(player.id) ?? [];
    // Ett scenarioresultat ersätter spelarens tidigare resultat i samma turnering
    const addedEventIds = new Set(added.map((r) => r.eventId));
    const results = [
      ...player.results.filter((r) => !addedEventIds.has(r.eventId)),
      ...added,
    ];

    const nowState = pointsAt(player.results, now);
    const future = pointsAt(results, target);
    const countingIds = new Set(future.counting.map(key));

    return {
      player,
      rank: 0,
      points: future.points,
      currentRank: player.rank,
      currentPoints: nowState.points,
      pointsDelta: future.points - nowState.points,
      rankDelta: 0,
      counting: future.counting,
      expiring: player.results.filter(
        (r) => isActive(r, now) && !isActive(r, target),
      ),
      gained: added.filter((r) => countingIds.has(key(r))),
    } satisfies ProjectedPlayer;
  });

  // Sortering: poäng, sedan nuvarande placering som tiebreak så listan inte hoppar
  projected.sort((a, b) => b.points - a.points || a.currentRank - b.currentRank);
  projected.forEach((p, i) => {
    p.rank = i + 1;
    p.rankDelta = p.currentRank - p.rank;
  });

  return projected;
}

const key = (r: PlayerResult) => `${r.eventId}:${r.position}`;

/**
 * Poäng en spelare försvarar i en viss turnering: det hen fick i föregående
 * upplaga och som faller ur samma vecka som årets resultat landar.
 */
export function defending(player: Player, event: TournamentEvent): PlayerResult | null {
  return (
    player.results.find(
      (r) =>
        normalise(r.eventName) === normalise(event.name) &&
        compareWeeks(r.expires, event.landsIn) === 0,
    ) ?? null
  );
}

/** "WTT Champions Macao 2026" → "wtt champions macao" */
const normalise = (name: string) =>
  name.toLowerCase().replace(/\b(19|20)\d{2}\b/g, "").replace(/[^a-z]+/g, " ").trim();

/**
 * Vad en spelare faktiskt riskerar att tappa i en turnering — inte bruttopoängen,
 * utan nettot efter att reservresultatet klivit in i bästa 8.
 */
export function realExposure(player: Player, event: TournamentEvent, now: Week): number {
  const before = pointsAt(player.results, now).points;
  const after = pointsAt(player.results, event.landsIn).points;
  return before - after;
}
