/**
 * Tunn klient mot WTT:s interna API.
 *
 * WTT publicerar inget officiellt API, men deras egen Angular-frontend pratar med
 * ett Azure API Management-gateway. Bas-URL:er och API-nycklar ligger i klartext i
 * frontendens JS-bundle. Vi läser dem därifrån vid behov, vilket gör att jobbet
 * självläker om WTT roterar en nyckel eller byter host.
 *
 * Anropen kräver Origin/Referer från worldtabletennis.com — gatewayen avvisar
 * annars med 401. Det är också därför datan måste hämtas i CI och inte i webbläsaren:
 * CORS tillåter inga anrop från vår egen domän.
 */

export interface WttConfig {
  rankingApi: string;   // ittfPlayersRankingapi_frontdoor
  playersApi: string;   // ittfPlayersapi
  cmsApi: string;       // apiLocalEndpoint
  liveApi: string;      // scoreApiLocalEndpoint
  staticApi: string;    // liveMatchApiDomain_frontdoor
  liveStaticApi: string; // liveMatchApiDomain (utan cache — pågående matcher)
  rankingKey: string;   // ittfapikey
  ttuKey: string;       // ttu_apikey
}

const SITE = "https://www.worldtabletennis.com";

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  Origin: SITE,
  Referer: `${SITE}/`,
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
};

/** Hårdkodade fallbacks — används bara om bundle-extraktionen misslyckas. */
const FALLBACK: WttConfig = {
  rankingApi: "https://wttcmsapigateway-new.azure-api.net/internalttu/",
  playersApi: "https://wttcmsapigateway-new.azure-api.net/ttu/",
  cmsApi:
    "https://wtt-website-api-vm-frontdoor-hhaec5epbhdyfugz.a01.azurefd.net/primary/api/",
  liveApi:
    "https://wtt-website-api-vm-frontdoor-hhaec5epbhdyfugz.a01.azurefd.net/liveeventsapi/api/",
  staticApi: "https://wtt-web-frontdoor-cthahjeqhbh6aqe3.a01.azurefd.net/",
  liveStaticApi: "https://wtt-web-frontdoor-withoutcache-cqakg0andqf5hchn.a01.azurefd.net/",
  rankingKey: "",
  ttuKey: "",
};

let cachedConfig: WttConfig | null = null;

/**
 * Läser konfigurationen ur WTT:s publicerade JS-bundle.
 * Föredrar miljövariabler (GitHub Secrets) när de finns.
 */
export async function resolveConfig(): Promise<WttConfig> {
  if (cachedConfig) return cachedConfig;

  const fromEnv: Partial<WttConfig> = {
    rankingKey: process.env.WTT_RANKING_KEY || undefined,
    ttuKey: process.env.WTT_TTU_KEY || undefined,
  };

  let scraped: Partial<WttConfig> = {};
  try {
    scraped = await scrapeConfigFromBundle();
  } catch (err) {
    console.warn("Kunde inte läsa config ur WTT-bundlen:", (err as Error).message);
  }

  const cfg: WttConfig = {
    ...FALLBACK,
    ...stripUndefined(scraped),
    ...stripUndefined(fromEnv),
  };

  if (!cfg.rankingKey || !cfg.ttuKey) {
    throw new Error(
      "Saknar API-nycklar. Sätt WTT_RANKING_KEY och WTT_TTU_KEY, " +
        "eller se till att bundle-extraktionen fungerar.",
    );
  }

  cachedConfig = cfg;
  return cfg;
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== undefined && v !== ""),
  ) as Partial<T>;
}

async function scrapeConfigFromBundle(): Promise<Partial<WttConfig>> {
  const html = await (await fetch(SITE, { headers: BROWSER_HEADERS, signal: timeoutSignal() })).text();
  const bundle = html.match(/src="(main\.[a-f0-9]+\.js)"/)?.[1];
  if (!bundle) throw new Error("hittade ingen main-bundle i HTML:en");

  const js = await (
    await fetch(`${SITE}/${bundle}`, { headers: BROWSER_HEADERS, signal: timeoutSignal() })
  ).text();

  const pick = (key: string) =>
    js.match(new RegExp(`${key}\\s*:\\s*"([^"]*)"`))?.[1];

  return stripUndefined({
    rankingApi: pick("ittfPlayersRankingapi_frontdoor"),
    playersApi: pick("ittfPlayersapi"),
    cmsApi: pick("apiLocalEndpoint"),
    liveApi: pick("scoreApiLocalEndpoint"),
    staticApi: pick("liveMatchApiDomain_frontdoor"),
    liveStaticApi: pick("liveMatchApiDomain"),
    rankingKey: pick("ittfapikey"),
    ttuKey: pick("ttu_apikey"),
  });
}

// ---------------------------------------------------------------------------
// HTTP-hjälpare med retry och enkel strypning
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Ett anrop som hänger sig får aldrig stoppa hela jobbet. Utan gräns väntar Node i
 * flera minuter på ett svar som aldrig kommer, och en körning som aldrig tar slut
 * blockerar nästa. 25 sekunder är gott och väl för WTT:s snabbaste och långsammaste.
 */
const REQUEST_TIMEOUT_MS = 25_000;
const timeoutSignal = () => AbortSignal.timeout(REQUEST_TIMEOUT_MS);

async function getJson<T>(
  url: string,
  extraHeaders: Record<string, string> = {},
  attempt = 1,
): Promise<T> {
  const res = await fetch(url, {
    headers: { ...BROWSER_HEADERS, ...extraHeaders },
    signal: timeoutSignal(),
  });

  if (!res.ok) {
    // Gatewayen svarar 401 vid strypning lika gärna som vid fel nyckel,
    // så det är värt att backa av och försöka igen innan vi ger upp.
    if (attempt < 4 && (res.status === 401 || res.status >= 429)) {
      await sleep(attempt * 1500);
      return getJson<T>(url, extraHeaders, attempt + 1);
    }
    throw new Error(`${res.status} ${res.statusText} för ${url}`);
  }
  return (await res.json()) as T;
}

/** Kör uppgifter med begränsad parallellism. */
export async function pool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

// ---------------------------------------------------------------------------
// Typade endpoints
// ---------------------------------------------------------------------------

interface Envelope<T> {
  StatusCode: number;
  Result: T;
}

export interface RawRankingRow {
  IttfId: string;
  PlayerName: string;
  CountryCode: string;
  CountryName: string;
  SubEventCode: string;
  RankingYear: string;
  RankingMonth: string;
  RankingWeek: string;
  RankingPointsYTD: number;
  CurrentRank: number;
  PreviousRank: number;
  PublishDate: string;
}

export interface RawBreakdownRow {
  CompetitorId: number;
  EventId: number;
  EventName: string;
  ResultPosition: string;
  RankingCategoryCode: string;
  RankingPoints: number;
  RankingYear: number;
  RankingMonth: number;
  RankingWeek: number;
  isbestofx: number;
  bestofxorder: number;
  ExpiryYear: number;
  ExpiryWeek: number;
  ExpiryDate: string; // MM/DD/YYYY HH:mm:ss
}

export interface RawCalendarRow {
  EventId: number;
  EventName: string;
  EventType: string;
  EventTypeId: number;
  Country: string;
  City: string;
  StartDateTime: string | null;
  EndDateTime: string | null;
  FromStartDate: string | null;
  FromEndDate: string | null;
  ShowInCalendar: unknown;
}

export interface RawEntryRow {
  EventId: number;
  SubEventCode: string;
  ittfid: number;
  IndividualName: string;
  OrgCode: string;
  Status: string;
  Seed: number;
  CurrentRanking: number;
  CurrentRankingPoints: number;
}

/** Aktuell veckas ranking för en gren (MS/WS/MD/WD/XD). */
export async function fetchRanking(
  subEvent: string,
  endRank = 300,
): Promise<RawRankingRow[]> {
  const cfg = await resolveConfig();
  const url =
    `${cfg.rankingApi}RankingsCurrentWeek/CurrentWeek/GetRankingIndividuals` +
    `?CategoryCode=SEN&SubEventCode=${subEvent}&StartRank=1&EndRank=${endRank}`;
  const data = await getJson<Envelope<RawRankingRow[]>>(url, {
    ApiKey: cfg.rankingKey,
  });
  return data.Result ?? [];
}

/**
 * Full poängbreakdown för en spelare: varje resultat som räknas eller nyligen
 * räknats, med exakt utgångsdatum. Detta är kärnan i hela what-if-analysen.
 */
export async function fetchBreakdown(
  ittfId: string | number,
  rankingCategory: string,
  week: { year: number; month: number; week: number },
): Promise<RawBreakdownRow[]> {
  const cfg = await resolveConfig();
  const url =
    `${cfg.rankingApi}Rankings/GetRankingPointsBreakdown_FullList` +
    `?OrganizationCode=WTT&CategoryCode=SEN` +
    `&RankingCategoryCode=${rankingCategory}` +
    `&RankingYear=${week.year}&RankingMonth=${week.month}&RankingWeek=${week.week}` +
    `&PlayerID=${ittfId}`;
  const data = await getJson<Envelope<RawBreakdownRow[]>>(url, {
    ApiKey: cfg.ttuKey,
  });
  return data.Result ?? [];
}

/**
 * Turneringskalender för ett givet år.
 *
 * WTT lägger innevarande års kalender bakom sin front door och tidigare års som
 * statiska filer i frontendens assets. Vi provar båda — vilken som gäller
 * flyttar sig vid varje årsskifte.
 */
export async function fetchCalendar(year: number): Promise<RawCalendarRow[]> {
  const cfg = await resolveConfig();
  const sources = [
    `${cfg.staticApi}websitestaticapifiles/general/${year}_eventcalendar.json`,
    `${SITE}/assets/json/${year}_eventcalendar.json`,
  ];
  for (const url of sources) {
    try {
      const data = await getJson<Array<{ rows: RawCalendarRow[] }>>(url);
      const rows = data?.[0]?.rows ?? [];
      if (rows.length) return rows;
    } catch { /* prova nästa källa */ }
  }
  return [];
}

/** Anmälningslista för en turnering (alla grenar). */
export async function fetchEntries(eventId: number): Promise<RawEntryRow[]> {
  const cfg = await resolveConfig();
  return getJson<RawEntryRow[]>(`${cfg.liveApi}cms/GetPlayerEntriesforEvent/${eventId}/all`);
}

/** Officiell poängtabell för en turnering, om WTT publicerat den. */
export async function fetchEventPoints(
  eventId: number,
): Promise<Array<{ subEventName: string; place: string; points: string }>> {
  const cfg = await resolveConfig();
  const rows = await getJson<Array<{ ranking_data: string }>>(
    `${cfg.liveApi}cms/event_points_breakdown/list/${eventId}`,
  );
  if (!rows?.length) return [];
  try {
    return JSON.parse(rows[0].ranking_data);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Matchdata (lottning och matchkort)
// ---------------------------------------------------------------------------

/**
 * Som getJson, men "finns inte" är ett giltigt svar: HTTP 204 och 404 ger null.
 *
 * Allt annat som inte är ett riktigt svar — 5xx, strypning, en tom 200-kropp —
 * provas om och kastar till sist. WTT:s gateway tappar ibland enstaka anrop, och
 * ett tyst null skulle få en gren att försvinna från sajten tills nästa körning.
 */
async function getJsonOptional<T>(url: string): Promise<T | null> {
  let lastError = "";
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url, { headers: BROWSER_HEADERS, signal: timeoutSignal() });
      if (res.status === 204 || res.status === 404) return null;
      if (res.ok) {
        const text = await res.text();
        if (text.trim()) return JSON.parse(text) as T;
        lastError = "tom kropp";
      } else {
        lastError = `${res.status} ${res.statusText}`;
      }
    } catch (err) {
      lastError = (err as Error).message;
    }
    await sleep(attempt * 1500);
  }
  throw new Error(`${lastError} för ${url}`);
}

/**
 * Hela lottningen för en gren, t.ex. "MSINGLES", "WSINGLES", "XDOUBLES".
 * Null för grenar som inte finns i turneringen (eller lagtävlingar, som har annan form).
 */
export async function fetchBracket(eventId: number, subEventCode: string): Promise<unknown | null> {
  const cfg = await resolveConfig();
  return getJsonOptional(`${cfg.liveApi}cms/GetBrackets/${eventId}/TTE${subEventCode}`);
}

/**
 * Färdigspelade matchkort för en turnering. Med `documentCode` hämtas ett enskilt
 * kort, vilket är hur WTT:s egen sajt får tag på pågående matcher.
 */
export async function fetchMatchCards(eventId: number, documentCode?: string): Promise<unknown[]> {
  const cfg = await resolveConfig();
  const params = new URLSearchParams({ EventId: String(eventId), include_match_card: "true", take: "5000" });
  if (documentCode) {
    params.set("DocumentCode", documentCode);
    params.set("take", "1");
  }
  const rows = await getJsonOptional<Array<{ match_card?: unknown }>>(
    `${cfg.liveApi}cms/GetOfficialResult?${params}`,
  );
  return (rows ?? []).map((r) => r.match_card).filter(Boolean);
}

/**
 * Koder för matcher som pågår just nu i turneringen. WTT:s egen sajt läser först en
 * statisk fil och faller tillbaka på API:et; vi gör likadant. Objekten kommer antingen
 * i kortform `{e, d, s}` eller utvecklade `{eventId, documentCode, subEventType}`.
 */
export async function fetchLiveMatchCodes(eventId: number): Promise<Set<string>> {
  const cfg = await resolveConfig();
  const sources = [
    `${cfg.liveStaticApi}websitestaticapifiles/running-events/${eventId}/${eventId}_livematchids.json?q=${Date.now()}`,
    `${cfg.liveApi}cms/GetLiveResult?EventId=${eventId}`,
  ];
  for (const url of sources) {
    try {
      const rows = await getJsonOptional<Array<{ d?: string; documentCode?: string }>>(url);
      if (Array.isArray(rows) && rows.length) {
        return new Set(rows.map((r) => r.d ?? r.documentCode).filter((c): c is string => !!c));
      }
    } catch { /* prova nästa källa — "ingen live" är normalläget, fel ska inte stoppa jobbet */ }
  }
  return new Set();
}
