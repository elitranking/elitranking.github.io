import { describe, expect, it } from "vitest";
import { addWeeks, expiryWeek, isoWeek, landingWeek, mondayOf, compareWeeks } from "./week";

describe("ISO-veckor", () => {
  it("ger samma vecka som WTT anger för publiceringsdatumet", () => {
    // Rankingen publicerad 2026-08-17 är vecka 34 enligt API:et
    expect(isoWeek(new Date("2026-08-17T00:00:00Z"))).toEqual({ year: 2026, week: 34 });
  });

  it("måndagen i en vecka är just en måndag", () => {
    for (const week of [1, 12, 34, 52]) {
      expect(mondayOf({ year: 2026, week }).getUTCDay()).toBe(1);
    }
  });

  it("hanterar år med 53 veckor", () => {
    // 2020 hade 53 ISO-veckor. Naiv aritmetik (år*52+vecka) går fel här.
    expect(isoWeek(new Date("2020-12-28T00:00:00Z"))).toEqual({ year: 2020, week: 53 });
    expect(addWeeks({ year: 2020, week: 53 }, 1)).toEqual({ year: 2021, week: 1 });
  });

  it("lägger dagar mellan 31 dec och 3 jan i rätt ISO-år", () => {
    expect(isoWeek(new Date("2027-01-01T00:00:00Z"))).toEqual({ year: 2026, week: 53 });
  });

  it("jämför korrekt över årsskiften", () => {
    expect(compareWeeks({ year: 2026, week: 52 }, { year: 2027, week: 1 })).toBeLessThan(0);
    expect(compareWeeks({ year: 2027, week: 1 }, { year: 2026, week: 52 })).toBeGreaterThan(0);
  });

  it("poäng går ut exakt 52 veckor efter att de tjänades in", () => {
    // Wang Chuqins China Smash 2025: intjänat v41/2025, går ut v41/2026
    expect(expiryWeek({ year: 2025, week: 41 })).toEqual({ year: 2026, week: 41 });
  });

  it("landar resultat veckan efter att turneringen slutar", () => {
    // WTT Champions Macao 2026 avslutas söndag 13 september 2026 (v37) → v38
    expect(landingWeek("2026-09-13")).toEqual({ year: 2026, week: 38 });
  });
});
