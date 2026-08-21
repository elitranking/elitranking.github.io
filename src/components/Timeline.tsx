/**
 * Tidslinje över kommande turneringar.
 *
 * Den gör två saker samtidigt: väljer vilken turnering man redigerar, och sätter
 * hur långt fram rankingen projiceras. Att slå ihop dem håller antalet reglage
 * nere — man klickar sig helt enkelt framåt i tiden.
 */
import type { TournamentEvent, Week } from "../engine/types";
import { compareWeeks, formatWeek } from "../engine/week";
import { formatDate, type Lang, type Translate } from "../i18n";
import { Badge } from "./ui";

const TIER_STYLE: Array<[RegExp, string]> = [
  [/Grand Smash/i, "border-flame/60 bg-flame/10"],
  [/Finals/i, "border-felt-400/60 bg-felt-100/60 dark:bg-felt-900/40"],
  [/Champions/i, "border-felt-400/50 bg-felt-50 dark:bg-felt-900/25"],
  [/Star Contender/i, "border-ink-300/60 bg-white dark:bg-ink-900"],
];
const tierStyle = (type: string) =>
  TIER_STYLE.find(([re]) => re.test(type))?.[1] ?? "border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900";

export function Timeline({
  events, focused, picksByEvent, now, lang, t, onFocus,
}: {
  events: TournamentEvent[];
  focused: number | null;
  picksByEvent: Map<number, number>;
  now: Week;
  lang: Lang;
  t: Translate;
  onFocus: (id: number | null) => void;
}) {
  return (
    <div className="overflow-x-auto pb-1">
      <ol className="flex min-w-max gap-2">
        {events.map((event) => {
          const picks = picksByEvent.get(event.id) ?? 0;
          const isFocused = focused === event.id;
          const weeksAway = Math.round(
            compareWeeks(event.landsIn, now) / (7 * 24 * 3600 * 1000),
          );
          return (
            <li key={event.id}>
              <button
                onClick={() => onFocus(event.id)}
                aria-pressed={isFocused}
                className={`flex w-52 flex-col gap-1 rounded-lg border px-3 py-2 text-left transition
                  ${tierStyle(event.type)}
                  ${isFocused
                    ? "ring-2 ring-felt-600 ring-offset-1 dark:ring-offset-ink-950"
                    : "hover:border-felt-400"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[11px] font-medium uppercase tracking-wide text-ink-500">
                    {event.type.replace(/^WTT /, "")}
                  </span>
                  {picks > 0 && <Badge tone="felt">{picks}</Badge>}
                </div>
                <span className="line-clamp-2 text-sm font-semibold leading-snug">
                  {event.name.replace(/^WTT (Grand Smash|Champions|Star Contender|Contender|Feeder) /, "")}
                </span>
                <span className="text-[11px] text-ink-500 tnum">
                  {formatDate(event.start, lang)} – {formatDate(event.end, lang)}
                  <span className="mx-1 text-ink-300">·</span>
                  {formatWeek(event.landsIn)}
                  {weeksAway > 0 && <span className="ml-1 text-ink-300">+{weeksAway}v</span>}
                </span>
              </button>
            </li>
          );
        })}
        {!events.length && (
          <li className="px-3 py-6 text-sm text-ink-500">{t("noTournamentSelected")}</li>
        )}
      </ol>
    </div>
  );
}
