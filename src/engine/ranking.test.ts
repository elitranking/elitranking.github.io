import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { pointsAt, project, defending, realExposure } from "./ranking";
import { landingWeek, expiryWeek } from "./week";
import type { Player, PlayerResult, TournamentEvent, Week } from "./types";

// --- små byggare för läsbara testfall -------------------------------------

let seq = 0;
function result(points: number, opts: Partial<PlayerResult> = {}): PlayerResult {
  const earned: Week = opts.earned ?? { year: 2026, week: 10 };
  return {
    eventId: opts.eventId ?? ++seq,
    eventName: opts.eventName ?? `Turnering ${seq}`,
    position: opts.position ?? "W",
    points,
    earned,
    expires: opts.expires ?? expiryWeek(earned),
    continental: opts.continental ?? false,
    youth: opts.youth ?? false,
  };
}
const NOW: Week = { year: 2026, week: 20 };

describe("poängberäkning", () => {
  it("summerar de åtta bästa giltiga resultaten", () => {
    const results = [1000, 900, 800, 700, 600, 500, 400, 300, 200, 100].map((p) => result(p));
    const { points, counting, reserve } = pointsAt(results, NOW);
    expect(points).toBe(1000 + 900 + 800 + 700 + 600 + 500 + 400 + 300);
    expect(counting).toHaveLength(8);
    expect(reserve.map((r) => r.points)).toEqual([200, 100]);
  });

  it("bortser från resultat som gått ut", () => {
    const levande = result(1000, { earned: { year: 2026, week: 5 } });
    const utgånget = result(2000, { earned: { year: 2025, week: 5 } });
    expect(pointsAt([levande, utgånget], NOW).points).toBe(1000);
  });

  it("räknar inte resultat som ännu inte landat", () => {
    const framtida = result(2000, { earned: { year: 2026, week: 40 } });
    expect(pointsAt([framtida], NOW).points).toBe(0);
  });

  it("räknar bara ett kontinentalt resultat (§1.9.1)", () => {
    const results = [
      result(500, { continental: true }),
      result(400, { continental: true }),
      result(300),
    ];
    const { points, blocked } = pointsAt(results, NOW);
    expect(points).toBe(800);
    expect(blocked.map((r) => r.points)).toEqual([400]);
  });

  it("räknar högst fyra ungdomsresultat (§1.9.2)", () => {
    const results = [
      ...[50, 40, 30, 20, 10].map((p) => result(p, { youth: true })),
      result(5),
    ];
    const { points, blocked } = pointsAt(results, NOW);
    expect(points).toBe(50 + 40 + 30 + 20 + 5);
    expect(blocked.map((r) => r.points)).toEqual([10]);
  });

  it("låter ZPP ta en av de åtta platserna trots noll poäng", () => {
    const results = [
      ...[900, 800, 700, 600, 500, 400, 300, 200].map((p) => result(p)),
      result(0, { position: "ZPP" }),
    ];
    const { points, counting } = pointsAt(results, NOW);
    expect(counting).toHaveLength(8);
    // Lägsta riktiga resultatet (200) trängs ut av ZPP-platsen
    expect(points).toBe(900 + 800 + 700 + 600 + 500 + 400 + 300);
  });

  it("ger samma svar oavsett resultatens ordning", () => {
    const results = [500, 500, 500, 400, 300].map((p) => result(p));
    const a = pointsAt(results, NOW).points;
    const b = pointsAt([...results].reverse(), NOW).points;
    expect(a).toBe(b);
  });
});

// --- scenarier -------------------------------------------------------------

const macao: TournamentEvent = {
  id: 9001,
  name: "WTT Champions Macao 2026",
  type: "WTT Champions",
  city: "Macao",
  country: "Macao",
  start: "2026-09-08",
  end: "2026-09-13",
  landsIn: landingWeek("2026-09-13"),
  points: { W: 1000, F: 700, SF: 350, QF: 175, R16: 90, R32: 15, DNP: 0 },
  pointsAreEstimated: false,
  entries: null,
  continental: false,
  youth: false,
};

function player(id: string, name: string, results: PlayerResult[], rank: number): Player {
  return {
    id, name, country: "SWE", rank, previousRank: rank,
    officialPoints: pointsAt(results, NOW).points, results,
  };
}

describe("scenarier", () => {
  it("låter reservresultatet kliva in när försvarspoäng faller", () => {
    // Åtta räknande resultat plus ett nionde i reserv. Det största går ut.
    const försvarat = result(1000, {
      earned: { year: 2025, week: 38 },
      eventName: "WTT Champions Macao 2025",
    });
    const övriga = [900, 800, 700, 600, 500, 400, 300].map((p) => result(p));
    const reserv = result(250);
    const p = player("1", "Försvararen", [försvarat, ...övriga, reserv], 1);

    const före = pointsAt(p.results, NOW).points;
    const efter = pointsAt(p.results, macao.landsIn).points;

    // Naivt vore fallet 1000. I verkligheten kliver reserven in: 1000 − 250 = 750.
    expect(före - efter).toBe(750);
    expect(realExposure(p, macao, NOW)).toBe(750);
  });

  it("identifierar vilka poäng en spelare försvarar i en turnering", () => {
    const gammal = result(1000, {
      earned: { year: 2025, week: 38 },
      eventName: "WTT Champions Macao 2025",
    });
    const p = player("1", "Titelförsvararen", [gammal], 1);
    expect(defending(p, macao)?.points).toBe(1000);
  });

  it("byter ledning när utmanaren vinner och ettan åker ut tidigt", () => {
    // Ettan leder med 300 poäng, men försvarar 1000 i Macao. Tvåan försvarar inget.
    const etta = player("1", "Ettan", [
      result(1000, { earned: { year: 2025, week: 38 }, eventName: "WTT Champions Macao 2025" }),
      ...[1000, 900, 800, 700, 600, 500, 400].map((p) => result(p)),
    ], 1);
    const tvåa = player("2", "Tvåan", [900, 850, 800, 750, 700, 650, 600, 350].map((p) => result(p)), 2);

    expect(etta.officialPoints).toBeGreaterThan(tvåa.officialPoints);

    const utfall = project({
      players: [etta, tvåa],
      events: [macao],
      picks: [
        { eventId: macao.id, playerId: "1", position: "R32" },
        { eventId: macao.id, playerId: "2", position: "W" },
      ],
      now: NOW,
      target: macao.landsIn,
    });

    expect(utfall[0].player.id).toBe("2");
    expect(utfall[0].rankDelta).toBe(1);
    expect(utfall[1].player.id).toBe("1");
  });

  it("ignorerar val för turneringar som ligger efter målveckan", () => {
    const p = player("1", "Spelaren", [result(100)], 1);
    const utfall = project({
      players: [p], events: [macao],
      picks: [{ eventId: macao.id, playerId: "1", position: "W" }],
      now: NOW, target: { year: 2026, week: 30 },   // före Macao
    });
    expect(utfall[0].points).toBe(100);
  });

  it("låter ett scenarioresultat ersätta ett tidigare resultat i samma turnering", () => {
    const p = player("1", "Spelaren", [
      result(90, { eventId: macao.id, eventName: macao.name, position: "R16" }),
    ], 1);
    const utfall = project({
      players: [p], events: [macao],
      picks: [{ eventId: macao.id, playerId: "1", position: "W" }],
      now: NOW, target: macao.landsIn,
    });
    expect(utfall[0].points).toBe(1000);
  });
});

// --- guldstandard: motorn mot WTT:s officiella siffror ---------------------

describe("mot verklig data från WTT", () => {
  const meta = "public/data/meta.json";
  const finns = existsSync(meta);
  const load = <T,>(p: string): T => JSON.parse(readFileSync(p, "utf8"));

  it.runIf(finns)("reproducerar officiella poäng för spelarna i rankingen", () => {
    const { week } = load<{ week: Week }>(meta);
    for (const sub of ["MS", "WS"]) {
      const players = load<Player[]>(`public/data/ranking-${sub}.json`);
      expect(players.length).toBeGreaterThan(100);
      const kontrollerade = players.filter((p) => p.results.length);
      const fel = kontrollerade
        .filter((p) => pointsAt(p.results, week).points !== p.officialPoints)
        .map((p) => `${sub} ${p.name}: ${pointsAt(p.results, week).points} ≠ ${p.officialPoints}`);

      // En enstaka udda spelare ska inte frysa hela sajten, men en regeländring
      // hos WTT slår igenom brett och måste stoppa nattbygget.
      const andel = fel.length / kontrollerade.length;
      if (andel > 0.01) throw new Error(`${sub}: ${fel.length}/${kontrollerade.length} avviker\n${fel.slice(0, 10).join("\n")}`);
      expect(fel.length).toBeLessThanOrEqual(Math.floor(kontrollerade.length * 0.01));
    }
  });

  it.runIf(finns)("reproducerar den officiella placeringsordningen", () => {
    const { week } = load<{ week: Week }>(meta);
    for (const sub of ["MS", "WS"]) {
      const players = load<Player[]>(`public/data/ranking-${sub}.json`);
      const utfall = project({ players, events: [], picks: [], now: week, target: week });
      // Poängen måste falla monotont med placeringen
      for (let i = 1; i < utfall.length; i++) {
        expect(utfall[i].points).toBeLessThanOrEqual(utfall[i - 1].points);
      }
      // Toppspelaren ska vara densamma som WTT rankar etta
      expect(utfall[0].player.id).toBe(players.find((p) => p.rank === 1)!.id);
    }
  });
});
