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

### Hur ofta uppdateras sajten?

- **Rankingen, poängen, anmälningslistor:** varje natt (04:15 UTC) och vid varje push
  (`deploy.yml`). WTT publicerar ny världsranking på måndagar.
- **Svenskarna i pågående turnering:** `live.yml` körs var femte minut via GitHub-schemat
  och publicerar bara om något har ändrats. Medan matcher pågår eller snart börjar
  publiceras den också om var 25:e minut utan ändring, som hjärtslag. Öppna sidor hämtar
  dessutom om matchdatan varje minut utan att man behöver ladda om, och visar en gul
  varning om den publicerade datan är äldre än 45 minuter.

#### Extern cron (rekommenderas)

GitHubs schema är best-effort: körningar hoppas över eller dröjer, och ett nyinlagt schema
kan dröja länge innan det körs första gången. För jämn takt, låt en extern cron-tjänst (t.ex.
cron-job.org) starta arbetsflödet direkt, var annan eller var tredje minut:

```
POST https://api.github.com/repos/elitranking/elitranking.github.io/actions/workflows/live.yml/dispatches
Accept: application/vnd.github+json
Authorization: Bearer <token>
X-GitHub-Api-Version: 2022-11-28
Content-Type: application/json

{"ref": "main"}
```

Lyckat svar är HTTP 204. Tokenen behöver behörigheten `workflow` (classic: `repo` + `workflow`).
Peka bara på **live.yml** — `deploy.yml` hämtar hundratals poängkonton och ska köras en gång
per natt, inte med några minuters mellanrum. Schemat och den externa cronen kan ligga
på samtidigt: körningarna är idempotenta, och en ny körning ersätter en som hänger sig.

Båda arbetsflödena har tidsgränser, och varje anrop mot WTT avbryts efter 25 sekunder.
Utan dem kan ett hängt jobb stå kvar i timmar och blockera publiceringskön.

GitHub stänger av schemalagda jobb i ett repo som varit helt orört i 60 dagar. En
push, eller en manuell körning under *Actions*, slår på dem igen.

### Svenskarna i turneringen

`scripts/fetch-swedes.mts` hittar turneringar som pågår i kalendern, hämtar varje
grens lottning och alla färdiga matchkort, och `scripts/swedes-model.ts` gör om det
till en rad per svensk match. Lottningen är skelettet — den visar vem som möter vem och
vem som går vidare — men den är en cache som ligger efter, så de officiella matchkorten
överstyr den för färdigspelade matcher. En match som saknar tid eller motståndare visas
som *Ej fastställd*. Tider omräknas från turneringens lokala tid till svensk tid.

Datan skrivs till `public/data/swedes.json`. `live.yml` återanvänder rankingfilerna från
den redan publicerade sajten i stället för att hämta om dem, och publicerar om bara när
`swedes.json` skiljer sig från den publicerade versionen.

Lagtävlingar (VM i lag, EM i lag) har en annan lottningsform och visas inte än.

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
npm run fetch:swedes   # bara svenskarnas matcher, tar några sekunder
npm run dev
npm test
```

## Förbehåll

Inofficiellt verktyg utan koppling till WTT eller ITTF. Anmälningslistor,
lottningar och poängtabeller kan ändras fram till turneringsstart, och för
turneringar där WTT ännu inte publicerat poängtabellen härleds den ur tidigare
upplagor.
