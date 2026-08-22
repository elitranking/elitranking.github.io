/**
 * Tvåspråkighet, svenska som standard.
 *
 * Ordboken är ett vanligt objekt snarare än ett i18n-bibliotek: appen har ett
 * hundratal strängar och noll behov av pluralregler eller lazy loading, och en
 * platt ordbok gör att TypeScript fångar en saknad översättning vid kompilering.
 */
export const LANGUAGES = { sv: "Svenska", en: "English" } as const;
export type Lang = keyof typeof LANGUAGES;

const sv = {
  appName: "Elitranking",
  tagline: "Räkna på rankingen istället för att gissa",

  mens: "Herrar",
  womens: "Damer",
  singles: "singel",

  rank: "Plats",
  player: "Spelare",
  points: "Poäng",
  change: "Förändring",
  nation: "Land",

  currentRanking: "Aktuell ranking",
  projectedRanking: "Projicerad ranking",
  updated: "Uppdaterad",
  week: "vecka",

  scenario: "Scenario",
  scenarioBuilder: "Scenariobyggare",
  tournaments: "Turneringar",
  chooseTournament: "Välj turnering",
  noTournamentSelected: "Välj en turnering i tidslinjen för att börja räkna.",
  entries: "anmälda",
  sortedByRanking: "sorterade efter aktuell ranking",
  scenarioHint:
    "Sätt ett utfall för de spelare du vill testa. Rankingen till vänster visar vad som händer om det blir verklighet.",
  weekState: "Läget",
  noPicksYet: "inga utfall valda",
  baselineNotice:
    "Inget utfall är valt än. Det här visar bara hur poängen ser ut vid det här datumet, med resultat som redan gått ut borträknade — ingen lottning eller seedning är inräknad. Sätt ett utfall i panelen till höger för att se vad turneringen faktiskt skulle betyda.",
  entryListPending: "Anmälningslistan är inte publicerad än — visar de högst rankade spelarna istället.",
  estimatedPoints: "Poängtabellen är härledd från tidigare upplagor och kan justeras av WTT.",

  outcome: "Utfall",
  defends: "Försvarar",
  atRisk: "Riskerar",
  reset: "Nollställ",
  resetAll: "Nollställ allt",
  share: "Dela scenario",
  linkCopied: "Länk kopierad",

  projectTo: "Projicera till",
  afterTournament: "efter",
  noChange: "Inget val",

  didNotPlay: "Spelar inte",
  winner: "Vinnare",
  finalist: "Final",
  semifinal: "Semifinal",
  quarterfinal: "Kvartsfinal",
  r16: "Åttondel",
  r32: "Sextondel",
  r64: "Trettiotvådel",
  r128: "Sextiofjärdedel",
  qualifier: "Kval",
  groupStage: "Gruppspel",

  breakdown: "Poängkonto",
  countingResults: "Räknande resultat",
  reserveResults: "Utanför bästa 8",
  blockedResults: "Utestängda av regelverket",
  expires: "Går ut",
  expiringSoon: "Går ut snart",
  noResults: "Inga registrerade resultat.",

  howItWorks: "Så räknas rankingen",
  rule1: "Rankingpoängen är summan av spelarens 8 bästa resultat.",
  rule2: "Varje resultat lever i exakt 52 veckor och faller sedan ur.",
  rule3: "Högst ett resultat får komma från en kontinental eller regional tävling.",
  rule4: "Högst fyra resultat får komma från ungdomstävlingar.",
  rule5: "Ett ZPP-resultat tar en av de åtta platserna trots att det ger noll poäng.",
  whyItMatters:
    "Den tredje och fjärde regeln är anledningen till att handräkning ofta slår fel — och att en spelare som tappar en titel sällan tappar hela poängsumman, eftersom nästa resultat i tur kliver in bland de åtta.",

  dataSource: "Data från WTT, uppdateras varje natt.",
  disclaimer:
    "Inofficiellt verktyg utan koppling till WTT eller ITTF. Anmälningslistor och poängtabeller kan ändras.",
  loading: "Hämtar rankingdata…",
  loadError: "Kunde inte ladda rankingdatan.",
  retry: "Försök igen",

  search: "Sök spelare",
  showMore: "Visa fler",
  showing: "Visar",
  of: "av",
  players: "spelare",
  climbers: "Största klättrare",
  fallers: "Största tapp",
  newNumberOne: "Ny etta",
  unchanged: "Oförändrad topp",
  pointsExpiring: "Poäng som går ut",
  next12Weeks: "kommande 12 veckorna",
} as const;

type Dict = Record<keyof typeof sv, string>;

const en: Dict = {
  appName: "Elitranking",
  tagline: "Do the maths on the ranking instead of guessing",

  mens: "Men's",
  womens: "Women's",
  singles: "singles",

  rank: "Rank",
  player: "Player",
  points: "Points",
  change: "Change",
  nation: "Nation",

  currentRanking: "Current ranking",
  projectedRanking: "Projected ranking",
  updated: "Updated",
  week: "week",

  scenario: "Scenario",
  scenarioBuilder: "Scenario builder",
  tournaments: "Tournaments",
  chooseTournament: "Choose a tournament",
  noTournamentSelected: "Pick a tournament from the timeline to start.",
  entries: "entries",
  sortedByRanking: "sorted by current ranking",
  scenarioHint:
    "Set an outcome for the players you want to test. The ranking on the left shows what happens if it becomes reality.",
  weekState: "State as of",
  noPicksYet: "no outcomes chosen",
  baselineNotice:
    "No outcome has been set yet. This just shows the points as they stand on this date, with anything already expired excluded — no draw or seeding is factored in. Set an outcome in the panel on the right to see what the tournament would actually mean.",
  entryListPending: "The entry list isn't published yet — showing the highest ranked players instead.",
  estimatedPoints: "The points table is derived from previous editions and may be adjusted by WTT.",

  outcome: "Result",
  defends: "Defending",
  atRisk: "At risk",
  reset: "Reset",
  resetAll: "Reset all",
  share: "Share scenario",
  linkCopied: "Link copied",

  projectTo: "Project to",
  afterTournament: "after",
  noChange: "No result",

  didNotPlay: "Doesn't play",
  winner: "Winner",
  finalist: "Final",
  semifinal: "Semifinal",
  quarterfinal: "Quarterfinal",
  r16: "Round of 16",
  r32: "Round of 32",
  r64: "Round of 64",
  r128: "Round of 128",
  qualifier: "Qualifying",
  groupStage: "Group stage",

  breakdown: "Points breakdown",
  countingResults: "Counting results",
  reserveResults: "Outside the best 8",
  blockedResults: "Blocked by the rules",
  expires: "Expires",
  expiringSoon: "Expiring soon",
  noResults: "No recorded results.",

  howItWorks: "How the ranking works",
  rule1: "Ranking points are the sum of a player's 8 best results.",
  rule2: "Every result lives for exactly 52 weeks, then drops off.",
  rule3: "At most one result may come from a continental or regional event.",
  rule4: "At most four results may come from youth events.",
  rule5: "A ZPP result takes one of the eight slots even though it scores nothing.",
  whyItMatters:
    "Rules three and four are why hand calculations go wrong — and why a player losing a title rarely loses the full amount, since the next result in line steps into the best eight.",

  dataSource: "Data from WTT, refreshed nightly.",
  disclaimer:
    "Unofficial tool, not affiliated with WTT or ITTF. Entry lists and points tables may change.",
  loading: "Loading ranking data…",
  loadError: "Could not load the ranking data.",
  retry: "Try again",

  search: "Search players",
  showMore: "Show more",
  showing: "Showing",
  of: "of",
  players: "players",
  climbers: "Biggest climbers",
  fallers: "Biggest drops",
  newNumberOne: "New world number one",
  unchanged: "Top unchanged",
  pointsExpiring: "Points expiring",
  next12Weeks: "next 12 weeks",
};

export const DICTIONARIES: Record<Lang, Dict> = { sv, en };
export type TranslationKey = keyof Dict;
export type Translate = (key: TranslationKey) => string;

export const makeTranslate = (lang: Lang): Translate => (key) => DICTIONARIES[lang][key];

/** Placeringskoder i WTT:s poängtabeller → översättningsnycklar. */
export const POSITION_LABELS: Record<string, TranslationKey> = {
  W: "winner", F: "finalist", SF: "semifinal", QF: "quarterfinal",
  R16: "r16", R32: "r32", R64: "r64", R128: "r128", DNP: "didNotPlay",
};

export function positionLabel(position: string, t: Translate): string {
  const key = POSITION_LABELS[position];
  if (key) return t(key);
  if (/^QR\d?$/.test(position)) return t("qualifier");
  if (/^G\d?L?$/.test(position)) return t("groupStage");
  return position;
}

/** Datumformat som följer språkvalet. */
export function formatDate(iso: string, lang: Lang): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(lang === "sv" ? "sv-SE" : "en-GB", {
    day: "numeric", month: "short", timeZone: "UTC",
  });
}
