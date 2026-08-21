/**
 * Klassificering av turneringar enligt ITTF:s rankingregler.
 *
 * Reglerna sätter tak på hur många resultat av vissa slag som får räknas, så
 * motorn måste veta vad varje turnering är för något. WTT:s API säger det inte
 * rakt ut — `AgeCategoryCode` i poängbreakdownen avser rankinggrenen, inte
 * turneringen — så vi klassar på turneringstyp och namn.
 */
import type { EventClass } from "./types";

/**
 * Turneringar öppna för alla nationaliteter. Allt annat behandlas som
 * kontinentalt eller regionalt, vilket är rätt sida att fela på: listan över
 * kontinentala tävlingar är lång och rörlig, listan över öppna är kort och stabil.
 */
const OPEN_TO_ALL =
  /^(WTT |WTTC$|Singles World Cup$|World Mixed Team Championships$|World Youth Championships$|Olympic)/;

/**
 * Icke-seniortävlingar. U21 saknas medvetet: regelverket antyder att det är
 * icke-senior, men WTT:s egen data räknar U21-resultat som seniorresultat.
 * Verifierat mot 500 spelare — tas U21 med här faller fyra spelare ur.
 */
const YOUTH = /youth|junior|cadet|\bu-?(11|13|15|17|19)\b/i;

/**
 * Namnmönster för nationalitetsbegränsade tävlingar. Används bara när
 * turneringstypen är okänd — då är det säkrare att läsa namnet än att gissa
 * "kontinental", eftersom en felklassad WTT-turnering skulle kapa en spelares
 * poäng med tusental.
 */
const CONTINENTAL_NAME =
  /continental|regional|europ|asian|africa|americas|oceania|pan american|south american|central american|caribbean|ettu|attu|commonwealth|solidarity games|mediterranean|arab |sea games|asian games/i;

export function classifyEvent(eventType: string | undefined, eventName = ""): EventClass {
  const type = eventType?.trim();
  return {
    continental: type ? !OPEN_TO_ALL.test(type) : CONTINENTAL_NAME.test(eventName),
    youth: YOUTH.test(type ?? "") || YOUTH.test(eventName),
  };
}

/** Placeringskod för deltagande utan poäng. Tar en av de åtta platserna ändå. */
export const ZERO_POINT_PARTICIPATION = "ZPP";

/** Tak enligt §1.9.1 och §1.9.2. */
export const LIMITS = { continental: 1, youth: 4 } as const;
