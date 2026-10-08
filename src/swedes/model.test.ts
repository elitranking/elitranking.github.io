import { describe, expect, it } from "vitest";
import {
  buildSwedeMatches, deriveOffsetMinutes, normalizeCode, prettyName,
  type RawBracket, type RawMatchCard, type RawPlace,
} from "../../scripts/swedes-model";

const ath = (given: string, family: string, org: string) => ({ Code: family, Description: { GivenName: given, FamilyName: family, Organization: org } });
const comp = (code: string, given: string, family: string, org: string) => ({
  Code: code, Organization: org, Description: { TeamName: `${family} ${given}` }, Composition: { Athlete: [ath(given, family, org)] },
});
const place = (pos: number, c: ReturnType<typeof comp> | null, extra: Partial<RawPlace> = {}): RawPlace => ({
  Code: c?.Code ?? "TBD", Pos: pos, Wlt: "", Result: null, PreviousUnit: null, Competitor: c, ...extra,
});

const KARLSSON = comp("104379", "Kristian", "KARLSSON", "SWE");
const XUE = comp("121412", "Fei", "XUE", "CHN");
const OH = comp("135367", "Junsung", "OH", "KOR");
const MOREGARD = comp("122044", "Truls", "MOREGARD", "SWE");
const CHAN = comp("133867", "Baldwin", "CHAN", "HKG");

const U_R64_A = "TTEMSINGLES-----------R64-001400--";
const U_R64_B = "TTEMSINGLES-----------R64-000900--";
const U_R32 = "TTEMSINGLES-----------R32-000700--";
const U_R32_LATER = "TTEMSINGLES-----------R32-000500--";

function bracket(): RawBracket {
  return {
    Competition: {
      Bracket: [{
        Code: "MAIN",
        BracketItems: [
          { Code: "R64-", BracketItem: [
            // Matchen är slut, men lottningen är en inaktuell ögonblicksbild utan vinnare.
            { Unit: U_R64_A, Date: "2026-10-04", Time: "12:45", Result: "1-2 (4:11,11:8,10:12,6:9,0:0)",
              CompetitorPlace: [place(1, XUE), place(2, KARLSSON)] },
            { Unit: U_R64_B, Date: "2026-10-05", Time: "18:35", Result: "",
              CompetitorPlace: [place(1, MOREGARD), place(2, CHAN)] },
          ] },
          // Karlsson har ännu inte flyttats in i nästa match i lottningen.
          { Code: "R32-", BracketItem: [
            { Unit: U_R32, Date: null, Time: null, Result: "", CompetitorPlace: [
              place(1, OH, { PreviousUnit: { Unit: "TTEMSINGLES-----------R64-001300--", Wlt: "W" } }),
              place(2, null, { PreviousUnit: { Unit: U_R64_A, Wlt: "" } }),
            ] },
            // Möregårdhs nästa match: motståndaren avgörs av två okända matcher.
            { Unit: U_R32_LATER, Date: null, Time: null, Result: "", CompetitorPlace: [
              place(1, null, { PreviousUnit: { Unit: U_R64_B, Wlt: "" } }),
              place(2, null, { PreviousUnit: { Unit: "TTEMSINGLES-----------R64-001000--", Wlt: "" } }),
            ] },
          ] },
        ],
      }],
    },
  };
}

const card = (over: Partial<RawMatchCard> = {}): RawMatchCard => ({
  documentCode: U_R64_A + "--------",
  competitiors: [{ competitiorId: "121412" }, { competitiorId: "104379" }],
  gameScores: "4-11,11-8,10-12,8-11,0-0",
  overallScores: "1-3",
  resultStatus: "OFFICIAL",
  tableName: "Table 1",
  matchDateTime: { startDateLocal: "10/04/2026 12:45:00", startDateUTC: "10/04/2026 04:45:00" },
  ...over,
});

describe("namn", () => {
  it("rättar svenska tecken och förnamn", () => {
    expect(prettyName("Anton", "KALLBERG")).toBe("Anton Källberg");
    expect(prettyName("Christina", "KALLBERG")).toBe("Stina Källberg");
    expect(prettyName("Truls", "MOREGARD")).toBe("Truls Möregårdh");
  });
  it("skiftlägesfixar okända namn, även med bindestreck", () => {
    expect(prettyName("Guan-Hong", "KUO")).toBe("Guan-Hong Kuo");
    expect(prettyName("Alexis", "LEBRUN")).toBe("Alexis Lebrun");
  });
});

describe("tid", () => {
  it("härleder tidszon ur matchkort", () => {
    expect(deriveOffsetMinutes([card()])).toBe(480);
    expect(deriveOffsetMinutes([])).toBeNull();
  });
  it("normaliserar matchkoder oavsett utfyllnad", () => {
    expect(normalizeCode("TTEMSINGLES-----------R64-001400----------")).toBe(normalizeCode(U_R64_A));
  });
});

describe("svenskarnas matcher", () => {
  const cards = new Map([[normalizeCode(U_R64_A), card()]]);
  const matches = buildSwedeMatches({ sub: "MS", bracket: bracket(), cards, offsetMin: 480 });
  const byId = (u: string) => matches.find((m) => m.id === normalizeCode(u))!;

  it("matchkortet överstyr en inaktuell lottning och orienterar resultatet svensk-först", () => {
    const m = byId(U_R64_A);
    expect(m.status).toBe("won");
    expect(m.sets).toEqual([3, 1]);
    expect(m.games).toEqual([[11, 4], [8, 11], [12, 10], [11, 8]]);
    expect(m.startUtc).toBe("2026-10-04T04:45:00Z");
    expect(m.opponent?.names).toEqual(["Fei Xue"]);
  });

  it("visar kommande match med tid omräknad till UTC", () => {
    const m = byId(U_R64_B);
    expect(m.status).toBe("scheduled");
    expect(m.startUtc).toBe("2026-10-05T10:35:00Z");
    expect(m.sets).toBeNull();
  });

  it("lägger till nästa match när lottningen ligger efter", () => {
    const m = byId(U_R32);
    expect(m.swedes.names).toEqual(["Kristian Karlsson"]);
    expect(m.opponent?.names).toEqual(["Junsung Oh"]);
    expect(m.status).toBe("tbd");
    expect(m.startUtc).toBeNull();
  });

  it("lägger inte till nästa match för en svensk som inte avgjort sin match", () => {
    expect(matches.find((m) => m.id === normalizeCode(U_R32_LATER))).toBeUndefined();
    expect(matches).toHaveLength(3);
  });

  it("sorterar i tidsordning med ej fastställda sist", () => {
    expect(matches.map((m) => m.status)).toEqual(["won", "scheduled", "tbd"]);
  });

  it("visar förlust sett ur svensken oavsett om hen står som hemma- eller bortalag", () => {
    const lost = new Map([[normalizeCode(U_R64_A), card({ overallScores: "3-1", gameScores: "11-4,8-11,12-10,11-8,0-0" })]]);
    const m = buildSwedeMatches({ sub: "MS", bracket: bracket(), cards: lost, offsetMin: 480 })
      .find((x) => x.id === normalizeCode(U_R64_A))!;
    expect(m.status).toBe("lost");
    expect(m.sets).toEqual([1, 3]);
    // Utan en vinnare finns ingen "nästa match".
    expect(buildSwedeMatches({ sub: "MS", bracket: bracket(), cards: lost, offsetMin: 480 })).toHaveLength(2);
  });

  it("markerar en match som pågår när WTT listar den som live, även utan ställning", () => {
    const m = buildSwedeMatches({
      sub: "MS", bracket: bracket(), cards: new Map(), offsetMin: 480,
      liveIds: new Set([U_R64_B + "--------"]), // kortets utfyllnad skiljer sig från lottningens
    }).find((x) => x.id === normalizeCode(U_R64_B))!;
    expect(m.status).toBe("live");
    expect(m.sets).toBeNull();
  });

  it("visar ställningen i en pågående match med ett game på gång, svensk sida först", () => {
    // Svensken är bortalag i U_R64_A, så kortets hemma–borta-ordning vänds. Tredje gamet står 5–3 till hemmalaget.
    const live = new Map([[normalizeCode(U_R64_A), card({ resultStatus: "", overallScores: "1-1", gameScores: "11-7,8-11,5-3" })]]);
    const m = buildSwedeMatches({
      sub: "MS", bracket: bracket(), cards: live, offsetMin: 480, liveIds: new Set([U_R64_A]),
    }).find((x) => x.id === normalizeCode(U_R64_A))!;
    expect(m.status).toBe("live");
    expect(m.sets).toEqual([1, 1]);
    expect(m.games).toEqual([[7, 11], [11, 8], [3, 5]]);
  });

  it("visar 0–0 när en listad live-match har kort men ingen poäng än", () => {
    const fresh = new Map([[normalizeCode(U_R64_A), card({ resultStatus: "", overallScores: "0-0", gameScores: "0-0,0-0,0-0,0-0,0-0" })]]);
    const m = buildSwedeMatches({
      sub: "MS", bracket: bracket(), cards: fresh, offsetMin: 480, liveIds: new Set([U_R64_A]),
    }).find((x) => x.id === normalizeCode(U_R64_A))!;
    expect(m.status).toBe("live");
    expect(m.sets).toEqual([0, 0]);
  });

  it("markerar en match som pågår när kortet inte är officiellt", () => {
    const live = new Map([[normalizeCode(U_R64_A), card({ resultStatus: "INTERMEDIATE", overallScores: "1-1", gameScores: "4-11,11-8,0-0,0-0,0-0" })]]);
    const m = buildSwedeMatches({ sub: "MS", bracket: bracket(), cards: live, offsetMin: 480 })
      .find((x) => x.id === normalizeCode(U_R64_A))!;
    expect(m.status).toBe("live");
    expect(m.sets).toEqual([1, 1]);
  });
});
