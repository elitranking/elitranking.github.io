/**
 * Datamodell för rankingmotorn.
 *
 * WTT:s system, verifierat empiriskt mot API:et (se scripts/validate.mts):
 *
 *   1. Varje resultat är giltigt i exakt 52 ISO-veckor från veckan det togs.
 *   2. En spelares rankingpoäng är summan av de 8 bästa giltiga resultaten.
 *   3. Rankingen publiceras varje måndag; "vecka" = ISO-vecka.
 *
 * Följdsatsen som gör appen intressant: när Wang Chuqin försvarar en titel
 * försvinner fjolårets poäng exakt samma vecka som årets landar — och om han
 * missar, kliver hans nionde bästa resultat in i bästa-8. Han backar alltså
 * sällan hela beloppet.
 */

/** Gren. v1 täcker herr- och damsingel. */
export type SubEvent = "MS" | "WS";

/** ISO-vecka, den enhet hela rankingen tickar i. */
export interface Week {
  year: number;
  week: number;
}

/**
 * Hur en turnering klassas av rankingreglerna. Avgör vilka tak som gäller.
 * `continental` = nationalitetsbegränsad tävling (§1.9.1, max ett resultat).
 * `youth` = icke-seniortävling (§1.9.2, max fyra resultat). U21 räknas som senior.
 */
export interface EventClass {
  continental: boolean;
  youth: boolean;
}

/** Ett resultat i en spelares poängkonto. */
export interface PlayerResult extends EventClass {
  eventId: number;
  eventName: string;
  /** Placering: "W", "F", "SF", "QF", "R16", "R32", "R64", "DNP", "W-48%" … */
  position: string;
  points: number;
  /** Veckan resultatet landade i rankingen. */
  earned: Week;
  /** Veckan det faller ur (giltigt till och med veckan före). */
  expires: Week;
}

export interface Player {
  id: string;
  name: string;
  country: string;
  rank: number;
  previousRank: number;
  /** Officiella poäng vid senaste publicering — används för validering. */
  officialPoints: number;
  results: PlayerResult[];
}

/** Poäng per placering i en turnering. */
export type PointsSchedule = Record<string, number>;

export interface TournamentEvent extends EventClass {
  id: number;
  name: string;
  /** "WTT Grand Smash", "WTT Champions", "WTT Star Contender", … */
  type: string;
  city: string;
  country: string;
  /** ISO-datum, YYYY-MM-DD. */
  start: string;
  end: string;
  /** Veckan resultaten från turneringen landar i rankingen. */
  landsIn: Week;
  /** Poängtabell. Officiell om WTT publicerat den, annars härledd ur tidigare upplagor. */
  points: PointsSchedule;
  /** Sant om poängtabellen är härledd och alltså kan ändras. */
  pointsAreEstimated: boolean;
  /** Anmälda spelares ITTF-id per gren. Null om anmälningslistan inte öppnat. */
  entries: Partial<Record<SubEvent, string[]>> | null;
}

/** Ett användarval: hur långt en spelare går i en turnering. */
export interface ScenarioPick {
  eventId: number;
  playerId: string;
  /** Nyckel i turneringens poängtabell, eller "DNP" för "spelar inte". */
  position: string;
}

export interface RankingSnapshot {
  subEvent: SubEvent;
  week: Week;
  publishDate: string;
  generatedAt: string;
  players: Player[];
}

/** Motorns självkontroll: hur många spelare den reproducerade exakt. */
export interface QualityReport {
  checked: number;
  mismatched: number;
}

export interface DataBundle {
  meta: {
    generatedAt: string;
    week: Week;
    publishDate: string;
    quality?: Record<SubEvent, QualityReport>;
  };
  rankings: Record<SubEvent, Player[]>;
  events: TournamentEvent[];
}
