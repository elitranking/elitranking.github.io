/**
 * Den projicerade rankinglistan, med utfällbart poängkonto per spelare.
 *
 * Poängkontot är där appen förtjänar sitt förtroende: man ser exakt vilka åtta
 * resultat som räknas, när vart och ett går ut, och vad som ligger näst på tur.
 * Utan den vyn är alla projektioner bara påståenden.
 */
import type { ProjectedPlayer } from "../engine/ranking";
import type { PlayerResult, Week } from "../engine/types";
import { compareWeeks, formatWeek, weekToIsoDate } from "../engine/week";
import { formatDate, positionLabel, type Lang, type Translate } from "../i18n";
import { Badge, Delta, Nation, RankArrow } from "./ui";

const WEEK_MS = 7 * 24 * 3600 * 1000;

export function RankingTable({
  rows, target, expandedPlayer, lang, t, onToggle, showProjection,
}: {
  rows: ProjectedPlayer[];
  target: Week;
  expandedPlayer: string | null;
  lang: Lang;
  t: Translate;
  onToggle: (playerId: string) => void;
  showProjection: boolean;
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wide text-ink-500 dark:border-ink-800">
          <th className="w-12 px-3 py-2 text-right font-medium">{t("rank")}</th>
          <th className="w-10 px-1 py-2 font-medium" />
          <th className="px-2 py-2 font-medium">{t("player")}</th>
          <th className="w-24 px-3 py-2 text-right font-medium">{t("points")}</th>
          {showProjection && <th className="w-24 px-3 py-2 text-right font-medium">{t("change")}</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const open = expandedPlayer === row.player.id;
          const moved = showProjection && row.rankDelta !== 0;
          return (
            <RankingRow
              key={row.player.id}
              row={row}
              open={open}
              moved={moved}
              target={target}
              lang={lang}
              t={t}
              onToggle={onToggle}
              showProjection={showProjection}
            />
          );
        })}
      </tbody>
    </table>
  );
}

function RankingRow({
  row, open, moved, target, lang, t, onToggle, showProjection,
}: {
  row: ProjectedPlayer;
  open: boolean;
  moved: boolean;
  target: Week;
  lang: Lang;
  t: Translate;
  onToggle: (id: string) => void;
  showProjection: boolean;
}) {
  const { player } = row;
  return (
    <>
      <tr
        onClick={() => onToggle(player.id)}
        className={`cursor-pointer border-b border-ink-100/70 transition hover:bg-ink-50 dark:border-ink-800/70 dark:hover:bg-ink-800/40
          ${open ? "bg-ink-50 dark:bg-ink-800/50" : ""}
          ${moved ? "flash" : ""}`}
      >
        <td className="px-3 py-2 text-right">
          <span className={`tnum font-semibold ${row.rank === 1 ? "text-flame" : ""}`}>{row.rank}</span>
        </td>
        <td className="px-1 py-2">{showProjection && <RankArrow delta={row.rankDelta} />}</td>
        <td className="px-2 py-2">
          <div className="flex items-baseline gap-2">
            <span className="font-medium">{player.name}</span>
            <Nation code={player.country} />
            {row.gained.length > 0 && <Badge tone="felt">+{row.gained.length}</Badge>}
          </div>
        </td>
        <td className="px-3 py-2 text-right tnum font-semibold">{row.points.toLocaleString("sv-SE")}</td>
        {showProjection && (
          <td className="px-3 py-2 text-right">
            <Delta value={row.pointsDelta} />
          </td>
        )}
      </tr>

      {open && (
        <tr className="border-b border-ink-100 bg-ink-50/60 dark:border-ink-800 dark:bg-ink-950/60">
          <td colSpan={showProjection ? 5 : 4} className="px-3 py-3">
            <Breakdown row={row} target={target} lang={lang} t={t} />
          </td>
        </tr>
      )}
    </>
  );
}

function Breakdown({ row, target, lang, t }: { row: ProjectedPlayer; target: Week; lang: Lang; t: Translate }) {
  const { counting, expiring } = row;
  if (!counting.length) return <p className="text-xs text-ink-500">{t("noResults")}</p>;

  const max = Math.max(...counting.map((r) => r.points), 1);

  return (
    <div className="space-y-3">
      <div>
        <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
          {t("countingResults")} ({counting.length})
        </h4>
        <ul className="space-y-1">
          {counting.map((r) => (
            <ResultRow key={`${r.eventId}-${r.position}`} result={r} max={max} target={target} lang={lang} t={t} />
          ))}
        </ul>
      </div>

      {expiring.length > 0 && (
        <div>
          <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-down">
            {t("pointsExpiring")} ({expiring.reduce((a, r) => a + r.points, 0).toLocaleString("sv-SE")}p)
          </h4>
          <ul className="space-y-1 opacity-70">
            {expiring.map((r) => (
              <ResultRow key={`x-${r.eventId}-${r.position}`} result={r} max={max} target={target} lang={lang} t={t} struck />
            ))}
          </ul>
        </div>
      )}

      {row.player.results.filter((r) => !counting.includes(r) && !expiring.includes(r)).length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-ink-500 hover:text-ink-700 dark:hover:text-ink-200">
            {t("reserveResults")}
          </summary>
          <ul className="mt-1.5 space-y-1">
            {row.player.results
              .filter((r) => !counting.includes(r) && !expiring.includes(r))
              .slice(0, 8)
              .map((r) => (
                <ResultRow key={`r-${r.eventId}-${r.position}`} result={r} max={max} target={target} lang={lang} t={t} muted />
              ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function ResultRow({
  result, max, target, lang, t, struck = false, muted = false,
}: {
  result: PlayerResult;
  max: number;
  target: Week;
  lang: Lang;
  t: Translate;
  struck?: boolean;
  muted?: boolean;
}) {
  const weeksLeft = Math.round(compareWeeks(result.expires, target) / WEEK_MS);
  const soon = weeksLeft >= 0 && weeksLeft <= 8;

  return (
    <li className={`flex items-center gap-2 text-xs ${muted ? "text-ink-500" : ""}`}>
      <span className="w-12 shrink-0 text-right tnum font-semibold">
        {result.points.toLocaleString("sv-SE")}
      </span>
      <span className="w-10 shrink-0 text-ink-500">{positionLabel(result.position, t)}</span>
      <span className="relative h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-ink-200 dark:bg-ink-800">
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-felt-400"
          style={{ width: `${Math.max(2, (result.points / max) * 100)}%` }}
        />
      </span>
      <span className={`min-w-0 flex-1 truncate ${struck ? "line-through" : ""}`}>{result.eventName}</span>
      <span className={`shrink-0 tnum ${soon ? "font-medium text-flame" : "text-ink-400"}`}>
        {t("expires")} {formatDate(weekToIsoDate(result.expires), lang)}
        <span className="ml-1 text-ink-300">{formatWeek(result.expires)}</span>
      </span>
    </li>
  );
}
