/**
 * Scenariobyggaren för en enskild turnering.
 *
 * Kolumnen som gör verktyget värt att öppna är "Riskerar": inte bruttopoängen
 * spelaren försvarar, utan vad hen faktiskt tappar efter att nästa resultat i tur
 * klivit in bland de åtta. Det är den siffran alla räknar fel på för hand.
 */
import { useMemo, useState } from "react";
import type { Player, SubEvent, TournamentEvent } from "../engine/types";
import { defending, realExposure } from "../engine/ranking";
import type { Week } from "../engine/types";
import { formatWeek } from "../engine/week";
import { positionLabel, type Translate } from "../i18n";
import { Nation } from "./ui";

const VISIBLE = 20;

export function ScenarioPanel({
  event, players, picks, now, subEvent, t, onPick, onClear,
}: {
  event: TournamentEvent;
  players: Player[];
  subEvent: SubEvent;
  picks: Record<string, string>;
  now: Week;
  t: Translate;
  onPick: (playerId: string, position: string | null) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);

  /** Placeringar turneringen delar ut, från vinnare och nedåt. */
  const positions = useMemo(
    () =>
      Object.entries(event.points)
        .filter(([pos]) => pos !== "DNP")
        .sort((a, b) => b[1] - a[1])
        .map(([pos]) => pos),
    [event.points],
  );

  /**
   * Anmälda spelare om listan finns, annars de högst rankade. Före en turnering
   * publicerar WTT sällan anmälningslistan förrän ett par veckor innan.
   */
  const candidates = useMemo(() => {
    const entered = event.entries?.[subEvent];
    const pool = entered
      ? players.filter((p) => entered.includes(p.id))
      : players;
    return pool.slice().sort((a, b) => a.rank - b.rank);
  }, [event, players, subEvent]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((p) => p.name.toLowerCase().includes(q) || p.country.toLowerCase().includes(q));
  }, [candidates, query]);

  const shown = expanded || query ? filtered.slice(0, 120) : filtered.slice(0, VISIBLE);
  const chosen = Object.keys(picks).length;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 px-4 py-3 dark:border-ink-800">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search")}
          className="min-w-40 flex-1 rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-sm outline-none placeholder:text-ink-300 focus:border-felt-400 dark:border-ink-700 dark:bg-ink-950"
        />
        <span className="text-xs text-ink-500 tnum">
          {candidates.length} {event.entries ? t("entries") : t("players")}
        </span>
        {chosen > 0 && (
          <button onClick={onClear} className="rounded-md px-2 py-1 text-xs font-medium text-ink-500 hover:bg-ink-100 hover:text-down dark:hover:bg-ink-800">
            {t("reset")}
          </button>
        )}
      </div>

      {(!event.entries || event.pointsAreEstimated) && (
        <div className="space-y-1 border-b border-ink-100 bg-amber-50/60 px-4 py-2 text-xs text-amber-800 dark:border-ink-800 dark:bg-amber-950/30 dark:text-amber-200">
          {!event.entries && <p>{t("entryListPending")}</p>}
          {event.pointsAreEstimated && <p>{t("estimatedPoints")}</p>}
        </div>
      )}

      <div className="max-h-[30rem] overflow-y-auto overflow-x-hidden">
        <table className="w-full table-fixed text-sm">
          <thead className="sticky top-0 z-10 bg-white/95 backdrop-blur dark:bg-ink-900/95">
            <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wide text-ink-500 dark:border-ink-800">
              <th className="w-8 px-2 py-2 text-right font-medium">#</th>
              <th className="px-2 py-2 font-medium">{t("player")}</th>
              <th className="w-20 px-1 py-2 text-right font-medium">{t("defends")}</th>
              <th className="w-16 px-1 py-2 text-right font-medium">{t("atRisk")}</th>
              <th className="w-28 px-2 py-2 font-medium">{t("outcome")}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((player) => {
              const held = defending(player, event);
              const exposure = held ? realExposure(player, event, now) : 0;
              const picked = picks[player.id] ?? "";
              return (
                <tr key={player.id} className="border-b border-ink-100/70 last:border-0 hover:bg-ink-50 dark:border-ink-800/70 dark:hover:bg-ink-800/40">
                  <td className="px-2 py-1.5 text-right text-xs text-ink-500 tnum">{player.rank}</td>
                  <td className="max-w-0 px-2 py-1.5">
                    <div className="flex items-baseline gap-1.5">
                      <span className="truncate font-medium" title={player.name}>{player.name}</span>
                      <Nation code={player.country} />
                    </div>
                  </td>
                  <td className="px-1 py-1.5 text-right">
                    {held && held.points > 0 ? (
                      <span className="whitespace-nowrap tnum text-xs" title={`${held.eventName} · ${positionLabel(held.position, t)}`}>
                        {held.points.toLocaleString("sv-SE")}
                        <span className="ml-1 text-ink-300">{held.position}</span>
                      </span>
                    ) : held ? (
                      <span className="text-[11px] text-ink-300" title={held.eventName}>{held.position}</span>
                    ) : (
                      <span className="text-ink-300">–</span>
                    )}
                  </td>
                  <td className="px-1 py-1.5 text-right">
                    {exposure > 0 ? (
                      <span className="tnum text-xs font-medium text-down">−{exposure.toLocaleString("sv-SE")}</span>
                    ) : (
                      <span className="text-ink-300">–</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    <select
                      value={picked}
                      onChange={(e) => onPick(player.id, e.target.value || null)}
                      aria-label={`${t("outcome")} ${player.name}`}
                      className={`w-full rounded-md border px-2 py-1 text-xs outline-none transition
                        ${picked
                          ? "border-felt-400 bg-felt-50 font-medium text-felt-700 dark:bg-felt-900/40 dark:text-felt-100"
                          : "border-ink-200 bg-white text-ink-500 dark:border-ink-700 dark:bg-ink-950"}`}
                    >
                      <option value="">{t("noChange")}</option>
                      {positions.map((pos) => (
                        <option key={pos} value={pos}>
                          {positionLabel(pos, t)} · {event.points[pos].toLocaleString("sv-SE")}p
                        </option>
                      ))}
                      <option value="DNP">{t("didNotPlay")}</option>
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {!expanded && !query && filtered.length > VISIBLE && (
          <button
            onClick={() => setExpanded(true)}
            className="w-full py-2 text-xs font-medium text-felt-600 hover:bg-ink-50 dark:hover:bg-ink-800/40"
          >
            {t("showMore")} ({filtered.length - VISIBLE})
          </button>
        )}
      </div>

      <p className="px-4 py-2 text-[11px] text-ink-500">
        {t("projectTo")} {formatWeek(event.landsIn)}
      </p>
    </div>
  );
}
