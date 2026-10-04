/**
 * Datamodellen för "Svenskarna i turneringen".
 *
 * Delas av hämtaren (scripts/) och gränssnittet (src/) så att en ändrad form
 * fångas av kompilatorn på båda sidor.
 */

export type SwedeSubEvent = "MS" | "WS" | "MD" | "WD" | "XD";

/**
 * - won / lost:   matchen är färdigspelad, sett ur den svenska sidan
 * - live:         pågår just nu
 * - scheduled:    har tid och motståndare
 * - tbd:          svensken är klar för nästa match men tid och/eller motståndare saknas
 */
export type SwedeMatchStatus = "won" | "lost" | "live" | "scheduled" | "tbd";

export interface MatchSide {
  /** Visningsnamn, "Kristian Karlsson". Par har två namn. */
  names: string[];
  /** IOC-koder, en per spelare. */
  orgs: string[];
}

export interface SwedeMatch {
  /** Matchkod utan utfyllnad, stabil mellan hämtningar. */
  id: string;
  sub: SwedeSubEvent;
  /** Placeringskod som appens positionLabel förstår: R64, R32, R16, QF, SF, F, QR1 … */
  round: string;
  qualifying: boolean;
  /** Den svenska sidan (par kan ha en utländsk partner). */
  swedes: MatchSide;
  /** Null om motståndaren inte är avgjord än. */
  opponent: MatchSide | null;
  /** När motståndaren inte är avgjord: de två som spelar matchen som avgör det. */
  opponentFrom: MatchSide[] | null;
  status: SwedeMatchStatus;
  /** Starttid i UTC, ISO 8601. Null när WTT inte satt någon tid. */
  startUtc: string | null;
  /** Starttid i turneringens lokala tid, "YYYY-MM-DDTHH:mm". Reserv när UTC saknas. */
  startLocal: string | null;
  /** Bord, om känt. */
  table: string | null;
  /** Ställning i set, svensk sida först. */
  sets: [number, number] | null;
  /** Poäng per game, svensk sida först. */
  games: Array<[number, number]> | null;
}

export interface SwedeEvent {
  id: number;
  name: string;
  city: string;
  country: string;
  start: string;
  end: string;
  matches: SwedeMatch[];
}

export interface SwedesData {
  /** När WTT-datan hämtades. */
  generatedAt: string;
  /** Pågående turneringar med minst en svensk. Tom lista = inget att visa. */
  events: SwedeEvent[];
}
