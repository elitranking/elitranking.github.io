/**
 * Applikationens tillstånd, byggt som The Elm Architecture: ett typat Model,
 * en union av Actions och en ren reducer. All beräkningslogik ligger i
 * src/engine och anropas härifrån — reducern gör bara bokföring.
 *
 * Att hålla den strikt ren har ett konkret syfte utöver renlärighet: scenariot
 * ska kunna serialiseras till en URL och återskapas exakt hos mottagaren.
 */
import type { ScenarioPick, SubEvent } from "./engine/types";
import type { Lang } from "./i18n";

export interface AppState {
  lang: Lang;
  subEvent: SubEvent;
  /** Vald turnering i scenariobyggaren. */
  focusedEvent: number | null;
  /** Alla val användaren gjort, nyckel: `${eventId}:${playerId}`. */
  picks: Record<string, ScenarioPick>;
  /** Spelare vars poängkonto är utfällt. */
  expandedPlayer: string | null;
  search: string;
  /** Hur många rader som visas i listorna. */
  limit: number;
}

export type Action =
  | { type: "SET_LANG"; lang: Lang }
  | { type: "SET_SUB_EVENT"; subEvent: SubEvent }
  | { type: "FOCUS_EVENT"; eventId: number | null }
  | { type: "SET_PICK"; eventId: number; playerId: string; position: string | null }
  | { type: "CLEAR_EVENT_PICKS"; eventId: number }
  | { type: "CLEAR_ALL_PICKS" }
  | { type: "TOGGLE_PLAYER"; playerId: string }
  | { type: "SET_SEARCH"; search: string }
  | { type: "SHOW_MORE" }
  | { type: "RESTORE"; state: Partial<AppState> };

export const PAGE_SIZE = 25;

export const initialState: AppState = {
  lang: "sv",
  subEvent: "MS",
  focusedEvent: null,
  picks: {},
  expandedPlayer: null,
  search: "",
  limit: PAGE_SIZE,
};

const pickKey = (eventId: number, playerId: string) => `${eventId}:${playerId}`;

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "SET_LANG":
      return { ...state, lang: action.lang };

    case "SET_SUB_EVENT":
      // Val är knutna till spelare i en gren; att bära med dem över till den
      // andra grenen skulle ge tysta, obegripliga utslag i listan.
      return action.subEvent === state.subEvent
        ? state
        : { ...state, subEvent: action.subEvent, picks: {}, expandedPlayer: null, limit: PAGE_SIZE };

    case "FOCUS_EVENT":
      return { ...state, focusedEvent: action.eventId === state.focusedEvent ? null : action.eventId };

    case "SET_PICK": {
      const key = pickKey(action.eventId, action.playerId);
      const picks = { ...state.picks };
      if (action.position === null) delete picks[key];
      else picks[key] = { eventId: action.eventId, playerId: action.playerId, position: action.position };
      return { ...state, picks };
    }

    case "CLEAR_EVENT_PICKS": {
      const picks = Object.fromEntries(
        Object.entries(state.picks).filter(([, p]) => p.eventId !== action.eventId),
      );
      return { ...state, picks };
    }

    case "CLEAR_ALL_PICKS":
      return { ...state, picks: {} };

    case "TOGGLE_PLAYER":
      return { ...state, expandedPlayer: state.expandedPlayer === action.playerId ? null : action.playerId };

    case "SET_SEARCH":
      return { ...state, search: action.search, limit: PAGE_SIZE };

    case "SHOW_MORE":
      return { ...state, limit: state.limit + PAGE_SIZE };

    case "RESTORE":
      return { ...state, ...action.state };
  }
}

// ---------------------------------------------------------------------------
// Delbar länk
// ---------------------------------------------------------------------------

/**
 * Kodar scenariot i URL:ens fragment. Formatet är avsiktligt kort och läsbart:
 *
 *   #MS/sv/3248:121558=W,135977=F/3298:121558=QF
 *
 * Fragmentet skickas aldrig till servern, vilket passar en statisk sajt, och en
 * människa kan se på länken vad den innehåller innan hen klickar.
 */
export function encodeScenario(state: AppState): string {
  const byEvent = new Map<number, string[]>();
  for (const pick of Object.values(state.picks)) {
    const list = byEvent.get(pick.eventId) ?? [];
    list.push(`${pick.playerId}=${pick.position}`);
    byEvent.set(pick.eventId, list);
  }
  const parts: string[] = [state.subEvent, state.lang];
  for (const [eventId, picks] of [...byEvent].sort((a, b) => a[0] - b[0])) {
    parts.push(`${eventId}:${picks.sort().join(",")}`);
  }
  return parts.join("/");
}

export function decodeScenario(hash: string): Partial<AppState> {
  const raw = hash.replace(/^#/, "").trim();
  if (!raw) return {};

  const [subEvent, lang, ...eventParts] = raw.split("/");
  const state: Partial<AppState> = {};

  if (subEvent === "MS" || subEvent === "WS") state.subEvent = subEvent;
  if (lang === "sv" || lang === "en") state.lang = lang;

  const picks: AppState["picks"] = {};
  for (const part of eventParts) {
    const [idText, listText] = part.split(":");
    const eventId = Number(idText);
    if (!Number.isFinite(eventId) || !listText) continue;
    for (const entry of listText.split(",")) {
      const [playerId, position] = entry.split("=");
      // Placeringar är korta versala koder; allt annat är skräp eller manipulerat
      if (!playerId || !/^[A-Z0-9]{1,4}$/.test(position ?? "")) continue;
      picks[pickKey(eventId, playerId)] = { eventId, playerId, position };
    }
  }
  if (Object.keys(picks).length) {
    state.picks = picks;
    state.focusedEvent = Number(eventParts[0]?.split(":")[0]) || null;
  }
  return state;
}
