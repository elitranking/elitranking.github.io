import { useEffect, useMemo, useReducer, useState } from "react";
import { loadData } from "./data";
import { project, type ProjectedPlayer } from "./engine/ranking";
import type { DataBundle, ScenarioPick, SubEvent, TournamentEvent, Week } from "./engine/types";
import { compareWeeks, formatWeek } from "./engine/week";
import { formatDate, makeTranslate, type Lang } from "./i18n";
import { decodeScenario, encodeScenario, initialState, reducer } from "./state";
import { RankingTable } from "./components/RankingTable";
import { ScenarioPanel } from "./components/ScenarioPanel";
import { Timeline } from "./components/Timeline";
import { Card, CardHeader, Toggle } from "./components/ui";

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [data, setData] = useState<DataBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const t = makeTranslate(state.lang);

  // Läs scenariot ur länken en gång vid start
  useEffect(() => {
    const restored = decodeScenario(window.location.hash);
    if (Object.keys(restored).length) dispatch({ type: "RESTORE", state: restored });
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadData()
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(String(e)));
    return () => { cancelled = true; };
  }, []);

  // Håll länken i takt med scenariot så att delning alltid fungerar
  useEffect(() => {
    const encoded = encodeScenario(state);
    const next = `${window.location.pathname}#${encoded}`;
    window.history.replaceState(null, "", next);
    document.documentElement.lang = state.lang;
  }, [state.lang, state.subEvent, state.picks]);

  if (error) return <Fallback message={t("loadError")} detail={error} action={t("retry")} />;
  if (!data) return <Fallback message={t("loading")} />;

  return <Workspace data={data} state={state} dispatch={dispatch} t={t} />;
}

function Workspace({
  data, state, dispatch, t,
}: {
  data: DataBundle;
  state: ReturnType<typeof reducer>;
  dispatch: React.Dispatch<Parameters<typeof reducer>[1]>;
  t: ReturnType<typeof makeTranslate>;
}) {
  const players = data.rankings[state.subEvent];
  const now = data.meta.week;

  const picks = useMemo<ScenarioPick[]>(() => Object.values(state.picks), [state.picks]);

  /** Turneringar som delar ut poäng i den valda grenen. */
  const events = useMemo(
    () => data.events.filter((e) => !e.entries || e.entries[state.subEvent]?.length || !e.entries[otherSub(state.subEvent)]),
    [data.events, state.subEvent],
  );

  /**
   * Hur långt fram vi projicerar: till och med den senaste turnering som antingen
   * är vald eller har något utfall satt. Att härleda det istället för att ha ett
   * eget reglage håller modellen liten — man klickar sig helt enkelt framåt.
   */
  const targetEvent = useMemo<TournamentEvent | null>(() => {
    const ids = new Set(picks.map((p) => p.eventId));
    if (state.focusedEvent) ids.add(state.focusedEvent);
    const relevant = events.filter((e) => ids.has(e.id));
    if (!relevant.length) return null;
    return relevant.reduce((a, b) => (compareWeeks(a.landsIn, b.landsIn) >= 0 ? a : b));
  }, [events, picks, state.focusedEvent]);

  const target: Week = targetEvent?.landsIn ?? now;
  const isProjecting = compareWeeks(target, now) > 0;

  const projection = useMemo(
    () => project({ players, events, picks, now, target }),
    [players, events, picks, now, target],
  );

  const visible = useMemo(() => {
    const q = state.search.trim().toLowerCase();
    const rows = q
      ? projection.filter((r) => r.player.name.toLowerCase().includes(q) || r.player.country.toLowerCase().includes(q))
      : projection;
    return rows.slice(0, state.limit);
  }, [projection, state.search, state.limit]);

  const focused = events.find((e) => e.id === state.focusedEvent) ?? null;

  const picksByEvent = useMemo(() => {
    const m = new Map<number, number>();
    for (const p of picks) m.set(p.eventId, (m.get(p.eventId) ?? 0) + 1);
    return m;
  }, [picks]);

  const focusedPicks = useMemo(() => {
    const out: Record<string, string> = {};
    for (const p of picks) if (p.eventId === focused?.id) out[p.playerId] = p.position;
    return out;
  }, [picks, focused]);

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16">
      <Header state={state} dispatch={dispatch} t={t} />

      <section className="mb-4">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">{t("tournaments")}</h2>
        <Timeline
          events={events}
          focused={state.focusedEvent}
          picksByEvent={picksByEvent}
          now={now}
          lang={state.lang}
          t={t}
          onFocus={(eventId) => dispatch({ type: "FOCUS_EVENT", eventId })}
        />
      </section>

      <Highlights projection={projection} isProjecting={isProjecting} t={t} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]">
        <Card className="overflow-hidden">
          <CardHeader
            title={isProjecting ? t("projectedRanking") : t("currentRanking")}
            subtitle={
              isProjecting && targetEvent
                ? `${t("afterTournament")} ${targetEvent.name} · ${formatWeek(target)}`
                : `${t("updated")} ${formatDate(data.meta.publishDate, state.lang)} · ${t("week")} ${now.week}`
            }
            action={
              <input
                value={state.search}
                onChange={(e) => dispatch({ type: "SET_SEARCH", search: e.target.value })}
                placeholder={t("search")}
                className="w-36 rounded-md border border-ink-200 bg-white px-2 py-1 text-xs outline-none focus:border-felt-400 dark:border-ink-700 dark:bg-ink-950"
              />
            }
          />
          <div className="overflow-x-auto">
            <RankingTable
              rows={visible}
              target={target}
              expandedPlayer={state.expandedPlayer}
              lang={state.lang}
              t={t}
              onToggle={(playerId) => dispatch({ type: "TOGGLE_PLAYER", playerId })}
              showProjection={isProjecting}
            />
          </div>
          <div className="flex items-center justify-between px-3 py-2 text-[11px] text-ink-500">
            <span className="tnum">
              {t("showing")} {visible.length} {t("of")} {projection.length} {t("players")}
            </span>
            {visible.length < projection.length && (
              <button onClick={() => dispatch({ type: "SHOW_MORE" })} className="font-medium text-felt-600 hover:underline">
                {t("showMore")}
              </button>
            )}
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="overflow-hidden">
            <CardHeader
              title={focused ? focused.name : t("scenarioBuilder")}
              subtitle={focused ? `${focused.type} · ${formatDate(focused.start, state.lang)}` : t("chooseTournament")}
              action={
                picks.length > 0 ? (
                  <button
                    onClick={() => dispatch({ type: "CLEAR_ALL_PICKS" })}
                    className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-ink-500 hover:bg-ink-100 hover:text-down dark:hover:bg-ink-800"
                  >
                    {t("resetAll")}
                  </button>
                ) : undefined
              }
            />
            {focused ? (
              <ScenarioPanel
                event={focused}
                players={players}
                picks={focusedPicks}
                now={now}
                subEvent={state.subEvent}
                t={t}
                onPick={(playerId, position) =>
                  dispatch({ type: "SET_PICK", eventId: focused.id, playerId, position })
                }
                onClear={() => dispatch({ type: "CLEAR_EVENT_PICKS", eventId: focused.id })}
              />
            ) : (
              <p className="px-4 py-8 text-center text-sm text-ink-500">{t("noTournamentSelected")}</p>
            )}
          </Card>

          <RulesCard t={t} />
        </div>
      </div>

      <Footer data={data} t={t} />
    </div>
  );
}

const otherSub = (s: SubEvent): SubEvent => (s === "MS" ? "WS" : "MS");

/** Hur långt ner i listan en placeringsändring fortfarande är en nyhet. */
const TOP_TIER = 50;

// ---------------------------------------------------------------------------

function Header({ state, dispatch, t }: any) {
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const url = `${window.location.origin}${window.location.pathname}#${encodeScenario(state)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt(t("share"), url);
    }
  };

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 py-5">
      <div className="flex items-baseline gap-3">
        <h1 className="text-2xl font-bold tracking-tight">
          <span className="text-felt-600">Elit</span>ranking
        </h1>
        <p className="hidden text-sm text-ink-500 sm:block">{t("tagline")}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Toggle
          label="Gren"
          value={state.subEvent}
          onChange={(subEvent: SubEvent) => dispatch({ type: "SET_SUB_EVENT", subEvent })}
          options={[
            { value: "MS" as SubEvent, label: `${t("mens")} ${t("singles")}` },
            { value: "WS" as SubEvent, label: `${t("womens")} ${t("singles")}` },
          ]}
        />
        <Toggle
          label="Språk"
          value={state.lang}
          onChange={(lang: Lang) => dispatch({ type: "SET_LANG", lang })}
          options={[
            { value: "sv" as Lang, label: "SV" },
            { value: "en" as Lang, label: "EN" },
          ]}
        />
        <button
          onClick={share}
          className="rounded-lg bg-felt-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-felt-700"
        >
          {copied ? t("linkCopied") : t("share")}
        </button>
      </div>
    </header>
  );
}

/** Snabb överblick: bytte toppen ägare, och vem rör sig mest? */
function Highlights({ projection, isProjecting, t }: { projection: ProjectedPlayer[]; isProjecting: boolean; t: any }) {
  if (!isProjecting || !projection.length) return null;

  const leader = projection[0];
  // Bara rörelser i toppen är intressanta. Längre ner i listan flyttar sig alla
  // några placeringar så fort någon annans poäng går ut, vilket säger ingenting.
  const contenders = projection.filter((p) => Math.min(p.rank, p.currentRank) <= TOP_TIER);
  const climbers = [...contenders].filter((p) => p.rankDelta > 0).sort((a, b) => b.rankDelta - a.rankDelta).slice(0, 3);
  const fallers = [...contenders].filter((p) => p.rankDelta < 0).sort((a, b) => a.rankDelta - b.rankDelta).slice(0, 3);

  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-3">
      <Card className="px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">
          {leader.currentRank === 1 ? t("unchanged") : t("newNumberOne")}
        </p>
        <p className="mt-1 flex items-baseline gap-2">
          <span className={`text-lg font-bold ${leader.currentRank === 1 ? "" : "text-flame"}`}>{leader.player.name}</span>
          <span className="tnum text-sm text-ink-500">{leader.points.toLocaleString("sv-SE")}p</span>
        </p>
      </Card>
      <MoverCard title={t("climbers")} rows={climbers} />
      <MoverCard title={t("fallers")} rows={fallers} />
    </div>
  );
}

function MoverCard({ title, rows }: { title: string; rows: ProjectedPlayer[] }) {
  return (
    <Card className="px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">{title}</p>
      <ul className="mt-1 space-y-0.5 text-sm">
        {rows.length === 0 && <li className="text-ink-300">–</li>}
        {rows.map((r) => (
          <li key={r.player.id} className="flex items-baseline justify-between gap-2">
            <span className="truncate">{r.player.name}</span>
            <span className={`shrink-0 tnum text-xs font-semibold ${r.rankDelta > 0 ? "text-up" : "text-down"}`}>
              {r.currentRank} → {r.rank}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function RulesCard({ t }: { t: any }) {
  return (
    <Card className="px-4 py-3">
      <h3 className="text-sm font-semibold">{t("howItWorks")}</h3>
      <ol className="mt-2 space-y-1 text-xs text-ink-700 dark:text-ink-200">
        {(["rule1", "rule2", "rule3", "rule4", "rule5"] as const).map((k, i) => (
          <li key={k} className="flex gap-2">
            <span className="tnum shrink-0 font-semibold text-felt-600">{i + 1}.</span>
            <span>{t(k)}</span>
          </li>
        ))}
      </ol>
      <p className="mt-2 border-t border-ink-100 pt-2 text-xs text-ink-500 dark:border-ink-800">{t("whyItMatters")}</p>
    </Card>
  );
}

function Footer({ data, t }: any) {
  return (
    <footer className="mt-8 border-t border-ink-200 pt-4 text-[11px] text-ink-500 dark:border-ink-800">
      <p>{t("dataSource")} {new Date(data.meta.generatedAt).toLocaleString("sv-SE")}</p>
      <p className="mt-1">{t("disclaimer")}</p>
    </footer>
  );
}

function Fallback({ message, detail, action }: { message: string; detail?: string; action?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="text-center">
        <p className="text-sm text-ink-500">{message}</p>
        {detail && <p className="mt-1 font-mono text-xs text-ink-300">{detail}</p>}
        {action && (
          <button onClick={() => location.reload()} className="mt-3 rounded-lg bg-felt-600 px-3 py-1.5 text-xs font-semibold text-white">
            {action}
          </button>
        )}
      </div>
    </div>
  );
}
