/**
 * ISO-veckoräkning.
 *
 * Hela rankingen tickar i ISO-veckor: rankingen publiceras varje måndag, och
 * varje resultat lever i exakt 52 veckor. Att jämföra veckor som (år, vecka)-par
 * med aritmetik går fel över årsskiften, eftersom vissa år har 53 veckor. Därför
 * kanoniserar vi alltid till måndagen i veckan och jämför tidsstämplar.
 */
import type { Week } from "./types";

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

/** ISO-veckan ett datum tillhör. */
export function isoWeek(date: Date): Week {
  const d = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const t = new Date(d);
  // Flytta till torsdagen i samma vecka — den avgör vilket ISO-år veckan tillhör
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7) + 3);
  const year = t.getUTCFullYear();
  const week = Math.round((t.getTime() - firstMonday(year).getTime()) / MS_PER_WEEK) + 1;
  return { year, week };
}

/** Måndagen i ISO-vecka 1 för ett givet ISO-år. */
function firstMonday(isoYear: number): Date {
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7));
  return monday;
}

/** Måndagen som inleder veckan — rankingens publiceringsdag. */
export function mondayOf(week: Week): Date {
  const d = firstMonday(week.year);
  d.setUTCDate(d.getUTCDate() + (week.week - 1) * 7);
  return d;
}

/** Jämförbart heltal för en vecka. Använd aldrig year*52+week direkt. */
export function weekOf(week: Week): number {
  return mondayOf(week).getTime();
}

export function addWeeks(week: Week, n: number): Week {
  const d = mondayOf(week);
  d.setUTCDate(d.getUTCDate() + n * 7);
  return isoWeek(d);
}

export function compareWeeks(a: Week, b: Week): number {
  return weekOf(a) - weekOf(b);
}

export const sameWeek = (a: Week, b: Week) => a.year === b.year && a.week === b.week;

/** "v34 2026" */
export const formatWeek = (w: Week) => `v${w.week} ${w.year}`;

/** ISO-datum (YYYY-MM-DD) för veckans måndag. */
export const weekToIsoDate = (w: Week) => mondayOf(w).toISOString().slice(0, 10);

/** Veckan ett resultat från en turnering som slutar `endDate` landar i. */
export function landingWeek(endDate: string | Date): Week {
  const d = typeof endDate === "string" ? new Date(`${endDate}T00:00:00Z`) : endDate;
  return addWeeks(isoWeek(d), 1);
}

/** Veckan då ett resultat intjänat i `earned` faller ur rankingen. */
export const expiryWeek = (earned: Week) => addWeeks(earned, 52);
