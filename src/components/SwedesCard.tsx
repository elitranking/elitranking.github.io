/**
 * "Svenskarna i turneringen" — alla matcher för svenska spelare i en pågående
 * turnering: spelat, pågående och kommande, i svensk tid.
 */
import type { ReactNode } from "react";
import { matchRoundLabel, type Lang, type Translate } from "../i18n";
import type { MatchSide, SwedeEvent, SwedeMatch } from "../swedes/types";
import { Badge, Card, CardHeader, Nation } from "./ui";

const TZ = "Europe/Stockholm";

/** "China Smash 2026 Presented by …" → "China Smash 2026". Sponsortillägget gör rubriken oläslig. */
const shortEventName = (name: string) => name.replace(/\s+presented by\b.*$/i, "").trim();

function formatWhen(m: SwedeMatch, lang: Lang, t: Translate): { date: string; time: string } | null {
  const locale = lang === "sv" ? "sv-SE" : "en-GB";
  if (m.startUtc) {
    const d = new Date(m.startUtc);
    return {
      date: d.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short", timeZone: TZ }),
      time: d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: TZ }),
    };
  }
  if (m.startLocal) {
    // Turneringens tidszon är okänd: visa lokal tid hellre än att gissa fel.
    const d = new Date(`${m.startLocal}:00Z`);
    return {
      date: d.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }),
      time: `${m.startLocal.slice(11, 16)} ${t("swedesLocalTime")}`,
    };
  }
  return null;
}

/** Ett par från samma land visar landskoden en gång. */
function Side({ side, hideSwe = false }: { side: MatchSide; hideSwe?: boolean }) {
  const orgs = [...new Set(side.orgs.filter((o) => o && !(hideSwe && o === "SWE")))];
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1.5">
      <span className="font-medium">{side.names.join(" / ")}</span>
      {orgs.map((o) => <Nation key={o} code={o} />)}
    </span>
  );
}

function Opponent({ m, t }: { m: SwedeMatch; t: Translate }) {
  if (m.opponent) return <Side side={m.opponent} />;
  if (m.opponentFrom) {
    const [a, b] = m.opponentFrom;
    return (
      <span className="text-ink-500">
        {t("swedesWinnerOf")} {a.names.join(" / ")} – {b.names.join(" / ")}
      </span>
    );
  }
  return <span className="text-ink-300">–</span>;
}

const gameList = (m: SwedeMatch) => m.games?.map(([a, b]) => `${a}–${b}`).join(", ") ?? "";

/** Ett game är färdigspelat vid minst 11 poäng och två i marginal. */
const isFinishedGame = ([a, b]: [number, number]) => Math.max(a, b) >= 11 && Math.abs(a - b) >= 2;

/** Pågående match: färdiga game, och gamet som spelas just nu för sig. */
function liveGames(m: SwedeMatch, nowLabel: string): string {
  const games = m.games ?? [];
  const last = games[games.length - 1];
  const running = last && !isFinishedGame(last) ? last : null;
  const done = running ? games.slice(0, -1) : games;
  const parts = [done.map(([a, b]) => `${a}–${b}`).join(", ")];
  if (running) parts.push(`${nowLabel} ${running[0]}–${running[1]}`);
  return parts.filter(Boolean).join(" · ");
}

function Result({ m, t, now, align = "left" }: { m: SwedeMatch; t: Translate; now: number; align?: "left" | "right" }) {
  const score = m.sets ? `${m.sets[0]}–${m.sets[1]}` : "";
  switch (m.status) {
    case "won":
    case "lost": {
      const won = m.status === "won";
      return (
        <div title={gameList(m)} className={align === "right" ? "text-right" : ""}>
          <span className={`font-semibold tnum ${won ? "text-up" : "text-down"}`}>
            <span aria-label={won ? t("swedesWon") : t("swedesLost")}>{won ? "✓" : "✕"}</span> {score}
          </span>
          <div className="text-[11px] text-ink-500 tnum">{gameList(m)}</div>
        </div>
      );
    }
    case "live":
      return (
        <div className={align === "right" ? "text-right" : ""}>
          <span className="inline-flex items-center gap-1.5 font-semibold text-felt-600">
            <span className="h-2 w-2 animate-pulse rounded-full bg-felt-500" aria-hidden />
            {t("swedesLive")} {score}
          </span>
          <div className="text-[11px] text-ink-500 tnum">{liveGames(m, t("swedesNowGame"))}</div>
        </div>
      );
    case "scheduled": {
      // Starttiden har passerat men inget resultat finns: matchen pågår troligen eller
      // är nyss slut. Säg det hellre än att låta den stå kvar som "Kommande".
      const started = m.startUtc !== null && Date.parse(m.startUtc) < now - 5 * 60_000;
      return started
        ? <Badge tone="warn"><span title={t("swedesAwaitingHint")}>{t("swedesAwaiting")}</span></Badge>
        : <Badge tone="neutral">{t("swedesUpcoming")}</Badge>;
    }
    default:
      return <Badge tone="warn"><span title={t("swedesNotSetHint")}>{t("swedesNotSet")}</span></Badge>;
  }
}

const SUB_KEY = { MS: "subMS", WS: "subWS", MD: "subMD", WD: "subWD", XD: "subXD" } as const;

export function SwedesCard({
  event, generatedAt, now, checkedAt, lang, t, action,
}: {
  event: SwedeEvent;
  generatedAt: string;
  /** Aktuell tid i ms, hålls av föräldern så att kortet förblir rent. */
  now: number;
  /** När webbläsaren senast hämtade datan. Visar att sidan följer med av sig själv. */
  checkedAt?: number | null;
  lang: Lang;
  t: Translate;
  /** Knapp som kopplar kortet till scenariobyggaren, om turneringen finns där. */
  action?: ReactNode;
}) {
  const locale = lang === "sv" ? "sv-SE" : "en-GB";
  const updated = new Date(generatedAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: TZ });
  const checked = checkedAt
    ? new Date(checkedAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZone: TZ })
    : null;
  const place = [event.city, event.country].filter(Boolean).join(", ");

  // Så länge matcher pågår eller snart börjar publiceras sajten om minst var 25:e minut,
  // även utan ändring. En äldre tidsstämpel än så betyder att uppdateringen har stannat.
  const soon = now + 3 * 3_600_000;
  const active = event.matches.some(
    (m) => m.status === "live" || (m.status === "scheduled" && m.startUtc !== null && Date.parse(m.startUtc) < soon),
  );
  const stale = active && now - Date.parse(generatedAt) > 45 * 60_000;

  return (
    <Card className="mb-4 overflow-hidden">
      <CardHeader
        title={`${t("swedesTitle")} ${shortEventName(event.name)}`}
        subtitle={`${place} · ${t("swedesTimeNote")} ${t("updated")} ${updated}${checked ? ` · ${t("swedesChecked")} ${checked}` : ""}`}
        action={action && <div className="hidden sm:block">{action}</div>}
      />

      {stale && (
        <p className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          {t("swedesStale")} {updated}.
        </p>
      )}

      {/* Smal skärm: en kompakt rad per match istället för en sex kolumner bred tabell. */}
      <ul className="divide-y divide-ink-100 dark:divide-ink-800 md:hidden">
        {event.matches.map((m) => {
          const when = formatWhen(m, lang, t);
          return (
            <li key={m.id} className={`px-4 py-2.5 ${m.status === "live" ? "bg-felt-50/60 dark:bg-felt-900/15" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <span className="text-xs text-ink-500 tnum">
                  {when ? `${when.date} · ${when.time}` : t("swedesNotSet")}
                </span>
                <Result m={m} t={t} now={now} align="right" />
              </div>
              <div className="mt-1 text-sm"><Side side={m.swedes} hideSwe /></div>
              <div className="text-sm text-ink-700 dark:text-ink-200">
                <span className="mr-1 text-ink-300">vs</span>
                <Opponent m={m} t={t} />
              </div>
              <div className="mt-0.5 text-[11px] text-ink-500">
                {t(SUB_KEY[m.sub])} · {matchRoundLabel(m.round, t)}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[42rem] text-sm">
          <thead>
            <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wide text-ink-500 dark:border-ink-800">
              <th className="px-3 py-2 font-medium">{t("swedesDate")}</th>
              <th className="px-2 py-2 font-medium">{t("swedesTime")}</th>
              <th className="px-2 py-2 font-medium">{t("swedesPlayer")}</th>
              <th className="px-2 py-2 font-medium">{t("swedesOpponent")}</th>
              <th className="px-2 py-2 font-medium">{t("swedesEvent")}</th>
              <th className="px-3 py-2 font-medium">{t("swedesResult")}</th>
            </tr>
          </thead>
          <tbody>
            {event.matches.map((m) => {
              const when = formatWhen(m, lang, t);
              const done = m.status === "won" || m.status === "lost";
              return (
                <tr
                  key={m.id}
                  className={`border-b border-ink-100/70 last:border-0 dark:border-ink-800/70 ${
                    m.status === "live" ? "bg-felt-50/60 dark:bg-felt-900/15" : done ? "text-ink-700 dark:text-ink-200" : ""
                  }`}
                >
                  {when ? (
                    <>
                      <td className="whitespace-nowrap px-3 py-2 tnum">{when.date}</td>
                      <td className="whitespace-nowrap px-2 py-2 tnum">{when.time}</td>
                    </>
                  ) : (
                    <td colSpan={2} className="whitespace-nowrap px-3 py-2 text-ink-500">{t("swedesNotSet")}</td>
                  )}
                  <td className="px-2 py-2"><Side side={m.swedes} hideSwe /></td>
                  <td className="px-2 py-2"><Opponent m={m} t={t} /></td>
                  <td className="px-2 py-2 text-xs text-ink-500">
                    {t(SUB_KEY[m.sub])}
                    <div>{matchRoundLabel(m.round, t)}</div>
                  </td>
                  <td className="px-3 py-2"><Result m={m} t={t} now={now} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-ink-100 px-4 py-2 dark:border-ink-800">
        <p className="text-[11px] text-ink-500">{t("swedesFootnote")}</p>
        {action && <div className="shrink-0 sm:hidden">{action}</div>}
      </div>
    </Card>
  );
}
