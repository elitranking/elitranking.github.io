# Elitranking

What-if-analys av bordtennisrankingen för världseliten.

Sätt utfall i kommande turneringar — *Wang åker ut i kvarten, Felix vinner* — och se
direkt vad som händer med rankingpoäng och placeringar. Verktyget finns för att
ersätta gissningarna i Facebook-trådarna med räknade svar.

**[elitranking.github.io](https://elitranking.github.io)**

## Varför det inte räcker att räkna för hand

Den vanliga uträkningen är `nuvarande poäng − försvarspoäng + nya poäng`. Den blir
nästan alltid fel, av fyra skäl:

1. **Rankingen är summan av de 8 bästa resultaten**, inte alla. Tappar en spelare
   ett av dem kliver nästa resultat i tur in och dämpar fallet. Wang Chuqin
   försvarar 1000 poäng i Macao, men backar bara 700 om han inte spelar — de
   sista 300 kommer från hans nionde bästa resultat.
2. **Högst ett resultat får komma från en kontinental eller regional tävling.**
   Ett EM-guld kan alltså vara värt noll poäng om spelaren redan har ett bättre
   kontinentalt resultat inne.
3. **Högst fyra resultat får komma från ungdomstävlingar.**
4. **Ett ZPP-resultat tar en av de åtta platserna trots att det ger noll poäng.**

Motorn implementerar alla fyra och verifierar sig mot WTT:s publicerade poäng
vid varje datahämtning.

## Så fungerar bygget

```
scripts/fetch-data.mts   hämtar ranking, poängkonton, kalender och anmälningar
   ↓  (GitHub Actions, varje natt)
public/data/*.json       statiska ögonblicksbilder
   ↓
src/engine/              ren TypeScript: veckor, regler, projektion
   ↓
src/                     React-gränssnitt, svenska och engelska
```

Sajten gör inga API-anrop mot WTT. Dels blockerar CORS det från en annan domän,
dels blir en färdigbyggd datafil snabbare och mer förutsägbar än en klient som
hämtar hundratals poängkonton vid varje sidladdning.

### Datakällan

WTT publicerar inget officiellt API, men deras egen webbplats hämtar allt från
ett Azure-gateway vars adresser och nycklar ligger i klartext i frontendens
JS-bundle. Hämtaren läser dem därifrån vid varje körning i stället för att ha dem
hårdkodade, vilket gör att nattjobbet överlever att WTT roterar en nyckel eller
byter host. Vill man låsa dem går det att sätta `WTT_RANKING_KEY` och
`WTT_TTU_KEY` som GitHub-secrets; de har företräde.

### Rankingmodellen

Allt tickar i ISO-veckor. Ett resultat landar veckan efter att turneringen
avslutas och lever i exakt 52 veckor — vilket betyder att förra årets poäng
faller ur precis den vecka årets upplaga landar. Man försvarar alltså bokstavligt.

Motorn ligger i `src/engine/` som rena funktioner utan beroenden, och testas mot
verklig data: `npm test` kontrollerar att modellen reproducerar WTT:s officiella
poäng för varje spelare i topp 250 i båda grenarna. Nattbygget kör samma test och
vägrar publicera om modellen och verkligheten glidit isär.

## Utveckling

```bash
npm install
npm run fetch     # hämtar färsk data till public/data/
npm run dev
npm test
```

## Förbehåll

Inofficiellt verktyg utan koppling till WTT eller ITTF. Anmälningslistor,
lottningar och poängtabeller kan ändras fram till turneringsstart, och för
turneringar där WTT ännu inte publicerat poängtabellen härleds den ur tidigare
upplagor.
