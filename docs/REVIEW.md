# Gatelog - oberoende granskning

Runda 2: 2026-11-07, granskad commit `826c6d5` (byggd från ren export av HEAD, utan bygg-agentens ocommittade ändringar). Runda 1: 2026-11-05, commit `2aa5d71`.
Granskaren har inte deltagit i bygget. Skala: 9 = i klass med de bästa apparna i kategorin (Untappd, Letterboxd, Swarm, Flighty), 7 = bra och fungerande, 5 = fungerar men med tydliga luckor, 3 = saknas i stort sett.

## Poäng

| Område | Runda 1 | Runda 2 |
|---|---|---|
| A. Visuell design och grafik | 6 | 7 |
| B. UX och användarvänlighet | 6 | 8 |
| C. Responsivitet och upplevd snabbhet | 7 | 8 |
| D. Frontend-kodkvalitet | 7 | 8 |
| E. Backend-kodkvalitet | 7 | 8 |
| F. Säkerhet | 7 | 7 |
| G. Projektstruktur och ordning | 6 | 8 |
| H. Tillgänglighet | 7 | 8 |
| I. Funktionsomfång jämfört med konkurrenterna | 5 | 7 |
| J. Gamification-känsla | 5 | 7 |
| K. Topplistor | 4 | 7 |
| L. Socialt samspel | 2 | 6 |
| M. Enkelhet att navigera | 6 | 8 |
| **Sammanfattning: Grafik (A) 6 -> 7 - Responsivitet (C) 7 -> 8 - Enkelhet att navigera (M) 6 -> 8 - Gamification (J) 5 -> 7 - Topplista (K) 4 -> 7 - Socialt samspel (L) 2 -> 6** | | |

Kort dom: ett tydligt lyft. Alla fyra kritiska fel från runda 1 är rättade. Check-in tar nu 3 tryck och avslutas med en sammanfattningsskärm som håller Untappd-klass (`flow-done-full.png`). Backend klarar 300 000 check-ins med p95 under 27 ms. Det finns nu ett socialt lager, nivåer och topplistor per period. Inget område når 9 ännu. Det som återstår är framför allt djup och finish:
- integritet för en app som loggar var folk reser,
- Web Push och moderering i det sociala lagret,
- import av resehistorik, rutter på kartan och en årsöversikt,
- finputs av siffror, kartor och notiser.

## Metod (runda 2)
- Läst `docs/API.md` (v2), `docs/DESIGN.md`, `docs/TEST-REPORT.md` (runda 2), README och all ändrad kod sedan `b8734e0` (267 filer, +17 100 rader).
- `npm install`, lint (0 fel, 1 varning), Prettier (rent), `npm test`: server 57/57 och klient 16/16 passerar. Test-agentens rapport: 297 tester, 0 fel, 6 fixme för BUG-09/10/11.
- Ren export av HEAD byggd separat, server på port 8790 med temporär databas och `seed:demo` (4 användare, 36 check-ins, följningar).
- Playwright med Pixel 7 (ljust och mörkt) och 1280 px desktop: 16 sidor, snabb check-in med mockad position (Landvetter), sammanfattningsskärm, tangentbordsordning och axe-core 4.10 (WCAG 2.2 AA) på 12 sidor i båda teman.
- Prestanda: CPU 4x och Slow 4G (150 ms RTT, 1,6 Mbit/s) via CDP, service worker blockerad (kall start). Samma metod som i runda 1, så siffrorna är jämförbara.
- `npm run bench -w server`: 5 000 användare och 300 000 check-ins.
- Skärmdumpar i `/tmp/claude-0/review2/` (inte incheckade).
- Kända fel som bygg-agenten rättar parallellt: BUG-09, BUG-10 och BUG-11. De ingår i bedömningen men styr den inte. BUG-07 (kartsteg) verkar rättat i HEAD: `atlas.js:38-46` följer nu DESIGN.md.

## Mätningar

| Sida (kall start, 4x CPU, Slow 4G) | Runda 1 LCP | Runda 2 FCP | Runda 2 LCP | CLS | JS | Typsnitt |
|---|---|---|---|---|---|---|
| `/` flöde | 1,30 s | 1,35 s | 1,35 s | 0 | 72 kB | 65 kB |
| `/airport/GOT` | 2,12 s | 1,27 s | 1,91 s | 0 | 80 kB | 65 kB |
| `/u/oliver` | 1,48 s | 1,24 s | 1,90 s | 0 | 91 kB | 65 kB |
| `/u/oliver/map` | 1,74 s | 1,22 s | 1,93 s | 0 | 145 kB | 49 kB |
| `/search` | 1,60 s | 1,22 s | 1,48 s | 0 | 80 kB | 74 kB |
| `/leaderboard` | 1,30 s | 1,26 s | 1,50 s | 0,001 | 77 kB | 49 kB |

I runda 1 laddades inga typsnitt alls, eftersom CSP blockerade dem. Runda 2 bär alltså 50-75 kB typsnitt och klarar ändå LCP under 2 s på alla sidor.

| Interaktion (throttlat, tid till synlig ändring) | Runda 1 | Runda 2 |
|---|---|---|
| Gilla | 297 ms | 281 ms |
| Flikbyte i flödet | 250 ms | 399 ms |
| Autocomplete, 3 tangenter inkl. debounce och RTT | 550 ms | 677 ms |
| SPA-navigering flöde -> flygplats | 622 ms | 832 ms |
| Tryck till klar check-in | 5 + 3 tangenter + scroll | **3** (Checka in, GOT 0,8 km, "Checka in på GOT") |

| API med 300 000 check-ins | Runda 1 | Runda 2 (medel / p95) |
|---|---|---|
| Autocomplete | 134-142 ms | 10 / 21 ms |
| Recensionssök | 612 ms | 10 / 21 ms |
| Topplistor | 263 ms | 11 / 23 ms |
| Flygplats och profil | 7-30 ms | 12 / 26 ms |

**Varning om bygg-agentens pågående ändringar.** I arbetskatalogen (inte committat) förladdas `airports-offline` (74 kB br, 246 kB okomprimerat), `Badges`, `CheckinPage` och `DonePage` på varje sida. Med det bygget mätte jag LCP 3,19 s på `/airport/GOT` och 3,05 s på kartan, alltså över målet 2,5 s. Förladdningen konkurrerar om bandbredden på 4G. Den ska starta först efter `load`, och bara i installerad PWA eller på check-in-sidan.

---

## A. Visuell design och grafik - 7 (runda 1: 6)
**Bättre.** Typsnitten laddas och Big Shoulders Display ger rubrikerna flygplatsskyltkaraktär. Statistikraden är tre eller fyra kolumner (`vp-m-light-airport.png`, `vp-m-light-profile.png`), och flödeskortet är kompakt med 2,5 kort per skärm. Desktop har sidopanel med nivå, streak och genvägar (`vp-d-light-feed.png`). Sammanfattningsskärmen med passtämpel är appens bästa vy (`flow-done-full.png`). Märkena har fyra nivåramar, mörka split-flap-brickor har kontur i mörkt tema, och kartans lägsta steg syns nu.

**Brister**
- **Snedstreckad nolla.** Atkinson Hyperlegible ritar 0 med snedstreck, så "4,0", "2026" och "0,8 km" ser ut som "4,Ø" och "2Ø26" i all brödtext (`vp-m-light-feed.png`). För en nordisk publik krockar det med bokstaven Ø (jfr "Læsø Airport" i samma lista, `flow-quick.png`).
- **Världskartan zoomar inte in** på besökta länder (`WorldMap.jsx:27` `fitSize` mot hela världen). Norden är några millimeter stort och Doha syns inte (`vp-m-light-map.png`). Det finns inga rutter eller flygplatsprickar på världskartan. Flighty visar flyglinjer.
- **Notislistan är en monoton textlista** med samma ikon på varje rad, utan avatarer och utan gruppering. Tio "Du nådde brons i märket ..." i rad (`vp-m-light-notifications.png`).
- **Märkeskorten är mycket stora.** Två per rad, cirka 450 px höga, så 18 märken blir nio skärmar (`vp-m-light-profile-badges.png`).
- **Understrukna länkar finns kvar i UI** ("3 följare", "2 följer", "@oliver", "GOT", "SAS Lounge", kommentarsräknaren i flödet).
- **"0 veckor i rad"** visas som en stor grå rad på profilen och i sidopanelen (`components/Level.jsx:39-51`), med nollan i ett annat typsnitt än texten.
- **"Visa flygplatser nära mig" är oformaterad text** utan knappkänsla (`vp-m-light-checkin.png`).
- **Resedetaljerna visas två gånger** på check-in-sidan: som rad i kortet och som `TravelDetailList` under (`vp-m-light-checkin-detail.png`).
- **Sammanfattningsskärmens knappar** blandar en stor grå "Klar", två textlänkar och två knappar i ojämnt rutnät.

**Åtgärder för 9+**
1. Använd en nolla utan snedstreck i brödtext. Prova `font-feature-settings` om Atkinson har en alternativ glyf. Annars använd Big Shoulders eller systemsiffror för siffror i löptext (en `.num`-klass). Ägare: Grafik.
2. Världskartan: zooma till besökta länder (bbox med marginal) med knapp för "hela världen". Lägg till prickar för besökta flygplatser. Ägare: Bygg + Grafik.
3. Notiser: avatar eller märkesbild per rad, gruppering ("Du nådde 9 nya märkesnivåer") och olästa i fetstil med punkt. Ägare: Grafik + Bygg (Backend: grupperingsnyckel).
4. Kompakt märkesvy: 3 kolumner på mobil med bild och namn, detaljer i bottenark. Ägare: Grafik + Bygg.
5. Ta bort understrykning på länkar i UI-komponenter. Behåll den bara i löptext. Ägare: Grafik.
6. Dölj streaken vid 0 eller formulera den positivt ("Checka in den här veckan för att starta en streak"). Ägare: Bygg + Grafik.
7. Gör "Nära dig" till en riktig knapp, ta bort dubbla resedetaljer och ge sammanfattningsskärmen en tydlig knappordning: primär Dela, sekundär Anslutning, Klar som textknapp. Ägare: Grafik + Bygg.

## B. UX och användarvänlighet - 8 (runda 1: 6)
**Bättre.** Snabb check-in tar 3 tryck med position och 2 tryck från "Senaste". Det är i nivå med Swarm. "Nära dig" visar avstånd i km. Skicka-knappen är klistrig ovanför menyn (y = 711 px av 839). Sammanfattningen visar XP, nivå, streak, världsandel och milstolpar. "Lägg till anslutning" förifyller datum och transfer. Check-ins kan redigeras, utloggning finns i Inställningar, och export och radering finns.

**Brister**
- **BUG-10 och BUG-11:** offlinekön, som är huvudfallet ombord, fungerar inte vid kall start, och första besöket kan ge vit sida. BUG-09: fel lösenord vid kontoradering loggar ut.
- **Inget betyg efteråt.** Snabb check-in utan betyg ger ingen uppmaning att betygsätta på sammanfattningsskärmen. Appens kärnvärde (betyg och recensioner) tappas för de snabbaste användarna.
- **Notisflod.** Första check-in för en ny användare, eller seed, ger 10+ märkesnotiser samtidigt och en röd "10" i toppfältet.
- **Tom placering i topplistan.** Veckolistan visar bara de som har värden. Om jag saknar check-ins denna vecka finns ingen rad "Du: inte med ännu - checka in för att klättra" (`vp-m-light-leaderboard.png`).
- **Flygplatser kan inte bytas vid redigering.** Det är medvetet enligt API:t, men felvalda flygplatser kräver radering. Det finns ingen förklaring i UI:t.

**Åtgärder för 9+**
1. Rätta BUG-09, BUG-10 och BUG-11. Ägare: Bygg (BUG-09 alternativt Backend: 403 i stället för 401).
2. Sammanfattningsskärmen: om betyg saknas, visa fem stjärnor direkt ("Hur var GOT?") som sparar med PATCH. Ägare: Bygg.
3. Slå ihop märkesnotiser som skapas i samma händelse till en notis. Ägare: Backend.
4. Topplistan: visa alltid en egen rad med uppmaning när `me` är null. Ägare: Bygg.
5. Vid redigering: förklara "Fel flygplats? Radera och checka in igen" med en knapp som gör båda. Ägare: Bygg.

## C. Responsivitet och upplevd snabbhet - 8 (runda 1: 7)
**Bättre.**
- Backend skalar nu: förberäknade tabeller via triggers, p95 under 27 ms vid 300 000 check-ins (runda 1: upp till 612 ms).
- LCP 1,35-1,93 s inklusive typsnitt, CLS 0 och initial JS 72 kB.
- Service worker med app-skal offline och förcachade route-chunks.
- Offlinekö i IndexedDB.

**Brister**
- **Interaktionerna har blivit långsammare under throttling.** Flikbyte 399 ms (250), SPA-navigering 832 ms (622), gilla 281 ms. Målet för INP "bra" är under 200 ms. Varje vy hämtar och renderar mer (nivå, streak, räknare). Flikbyte väntar på nätet i stället för att visa cachad lista direkt.
- **Typsnitten förladdas inte.** Rubriktypsnittet blir LCP-element på flygplatssidan (test-agenten mätte +100-300 ms).
- **Förladdningen i bygg-agentens pågående ändring** pressar LCP till 3,2 s (se Mätningar).
- **Notiser pollas var 60:e sekund** (`hooks/useUnread.js`). Det finns ingen push, så nyheter syns sent och varje öppen flik kostar anrop.
- **BUG-10:** offline vid kall start kan inte välja flygplats.

**Åtgärder för 9+**
1. Flikbyte och navigering: rendera cachat innehåll synkront (stale-while-revalidate gäller redan GET, se till att flikarna läser `peek` först). Använd `startTransition` för nätverksdelen och `React.memo` på `CheckinCard`. Mål: under 200 ms för gilla, flik och navigering vid 4x CPU. Ägare: Bygg.
2. `<link rel="preload" as="font" crossorigin>` för Big Shoulders 800 och Atkinson 400. Ägare: Grafik.
3. Starta förladdningen av offlinedata först efter `load` och bara i `display-mode: standalone` eller på check-in-sidan. Lägg till ett perf-test som fäller bygget om LCP överstiger 2,5 s. Ägare: Bygg.
4. Web Push (se L) i stället för polling, eller polla bara när appen är i förgrunden och backa av. Ägare: Backend + Bygg.
5. Rätta BUG-10 (senaste och hemmaflygplats i IndexedDB). Ägare: Bygg.

## D. Frontend-kodkvalitet - 8 (runda 1: 7)
**Bättre.**
- ESLint (React, hooks, jsx-a11y) och Prettier i CI. Lint ger 0 fel och en oanvänd disable-direktiv (`server/src/app.js:152`).
- Varje `eslint-disable` har en motivering.
- Inline-stilar har minskat från 142 till 44.
- Vitest och Testing Library (16 tester).
- Check-in-logiken är utbruten i `useCheckinForm.js`.
- Riktad cache-invalidering (`invalidate` i `api.js`) och 401-hantering med `logoutOn401`.
- Snippets renderas via `snippetParts` utan `innerHTML`.

**Brister**
- **Felgräns saknas i HEAD.** Det finns ingen error boundary runt lazy-routes (BUG-11). `RouteErrorBoundary.jsx` är under arbete men inte incheckad.
- **Klienttesterna är få.** 16 tester för cirka 8 400 rader. Offlinekön (`lib/idb.js`, köhantering) och `useCheckinForm` saknar enhetstester trots att det är där felen finns.
- **Inga typer.** Ingen TypeScript och ingen JSDoc-typning av API-objekten. API:t har vuxit till v2 med många nya fält.
- **Kvarvarande inline-stilar och stora filer.** 44 inline-stilar. `icons.jsx` är 360 rader, och `Badges`-chunken är 224 kB okomprimerad eftersom alla 72 märkes-SVG:er bundlas ihop.

**Åtgärder för 9+**
1. Checka in `RouteErrorBoundary` och förladda `DonePage` från check-in-sidan (BUG-11). Ägare: Bygg.
2. Tester för offlinekön (enqueue, flush, avvisad post, dubbletter), `useCheckinForm` och `QuickPick`. Mål: minst 60 klienttester och täckning av `lib/`. Ägare: Bygg.
3. JSDoc-typedefs eller `checkJs` för `Checkin`, `Badge`, `Level`, `Notification` och `Ranking`. Ägare: Bygg.
4. Ladda märkes-SVG som separata filer via URL (`new URL(..., import.meta.url)`) i stället för en 224 kB-chunk. Ta bort sista inline-stilarna. Ägare: Bygg + Grafik.

## E. Backend-kodkvalitet - 8 (runda 1: 7)
**Bättre.**
- Versionerade migreringar (`PRAGMA user_version`).
- Statistiktabeller via triggers i samma transaktion.
- `config.js` som enda läsare av env.
- Strukturerad JSON-loggning med `X-Request-Id`.
- `requestId` i 500-svar.
- Bayesianskt snitt, paginerade loungerecensioner och CRUD för check-ins och recensioner.
- 57 enhetstester, 56 API-kanttester och ett benchmark med budget.

**Brister**
- **`server/src/db.js` är 603 rader** med schema, migreringar, triggers och seed i samma fil.
- **Rate limit och topplistecache ligger i processminnet.** Det fungerar för en instans, men horisontell skalning eller omstart nollställer dem.
- **Tysta reservvärden.** Okända `metric`/`period`/`category` ger tyst standardvärde (200) i stället för 400 (TEST-REPORT, observation).
- **Synkron SQLite.** Event-loopen blockeras fortfarande av varje fråga. Med p95 under 27 ms är det acceptabelt nu, men export (`/me/export`) och kontoradering av stora konton körs synkront i en request.
- **Inga märkesnotiser grupperas.** Varje nivå blir en egen rad (se B).

**Åtgärder för 9+**
1. Dela `db.js` i `schema.sql`, `migrations/NNN-*.js` och `seed.js`. Ägare: Backend.
2. Validera enum-parametrar strikt (400 med lista på giltiga värden). Ägare: Backend.
3. Gruppera notiser per händelse (`group_key`) och dokumentera det i API.md. Ägare: Backend.
4. Abstraktion för rate limit och cache (gränssnitt med minnes- och SQLite-implementation) så att flera instanser kan dela tillstånd. Ägare: Backend.
5. Strömma export och kör radering i batchar för stora konton. Testa med 10 000 check-ins för en användare. Ägare: Backend.

## F. Säkerhet - 7 (runda 1: 7)
**Bättre.**
- Servern vägrar starta utan `JWT_SECRET` (minst 32 tecken) i produktion (`config.js`).
- Rate limit per användare eller IP på alla skrivande anrop med separata kvoter.
- EXIF, XMP och GPS rensas server-side.
- `snippetParts` ersätter `innerHTML`.
- Dataexport och kontoradering med lösenord, attribution, `npm audit` i CI.
- Strikt CSP, nu med `camera=(self)`.

Betyget står still, eftersom de största riskerna för just den här apptypen kvarstår.

**Brister**
- **Ingen integritet för resemönster.** Alla profiler, kartor, check-ins med datum, vänners besök på hemmaflygplatsen (`home_visit`-notiser) och flöden är publika. Det finns ingen privat profil, ingen fördröjning ("visa check-ins först efter 24 h") och inget val för vem som får följa. En app som visar var och när någon är bortrest behöver detta innan lansering. Det är också en GDPR-fråga om dataminimering och inbyggt dataskydd.
- **Ingen blockering eller rapportering** av användare och kommentarer, nu när kommentarer och följningar finns.
- **Kvarvarande tokenrisk.** JWT ligger kvar i `localStorage` med 30 dagars livstid (`server/src/auth.js:5`, `client/src/lib/api.js:12-26`). Det finns ingen server-side återkallelse, så utloggning, kontoradering eller stöld av token kan inte ogiltigförklara andra sessioner. Lösenordsbyte saknas helt.
- **Rate limit i minnet** (se E). Bakom proxy krävs `TRUST_PROXY`, vilket är dokumenterat.
- **Lösenordspolicyn** är fortfarande bara minst 8 tecken, utan kontroll mot läckta lösenord.

**Åtgärder för 9+**
1. Integritetsinställningar: privat profil (följning kräver godkännande), "dölj check-ins de senaste 24 h / 7 dagarna", "visa inte min hemmaflygplats" och opt-in för `home_visit`-notiser. Standard: fördröjning för publikt flöde. Ägare: Backend + Bygg.
2. Blockera och rapportera användare, kommentarer och check-ins, med enkel modereringskö. Ägare: Backend + Bygg.
3. Sessionsmodell: kort access-token plus refresh-token i `HttpOnly; Secure; SameSite=Strict`-cookie, sessionstabell med återkallelse, "logga ut överallt", lösenordsbyte som ogiltigförklarar sessioner. Ägare: Backend + Bygg.
4. Kontroll av lösenord mot läckta lösenord (k-anonymitet via HIBP-API eller lokal lista med vanliga lösenord). Ägare: Backend.

## G. Projektstruktur och ordning - 8 (runda 1: 6)
**Bättre.** README med snabbstart, kommandon, miljövariabler, struktur och licenstabell. `.env.example`, ESLint, Prettier och `.editorconfig`. CI-workflow med lint, test, bygge, audit och Playwright. Stilguiden ligger i `docs/`, och attribution finns i `server/data/ATTRIBUTION.md` och på `/about`.

**Brister**
- **`docs/API.md` är fortfarande en versionslogg.** Rubriken säger "(v1)", sedan följer v1.1, v1.2, v1.3, v2 och två omgångar "förtydliganden". Den som ska använda API:t måste läsa 350 rader och själv räkna ut vad som gäller (t.ex. att märkenas `icon` utgått och att `/leaderboard` ersatts).
- **Ingen LICENSE** för själva projektet.
- **Ingen `CHANGELOG.md`.** Historiken ligger i API.md och commitmeddelanden.
- **`db.js` med 603 rader** (se E).

**Åtgärder för 9+**
1. Konsolidera API.md till en aktuell referens per resurs (eller `openapi.yaml`) och flytta versionshistoriken till `CHANGELOG.md`. Ägare: Backend.
2. Lägg till LICENSE (eller "All rights reserved" uttryckligen). Ägare: Bygg.
3. Strukturera `server/src/db/` (se E.1). Ägare: Backend.

## H. Tillgänglighet - 8 (runda 1: 7)
**Bättre.**
- axe hittar inga allvarliga fel på 9 av 12 sidor i ljust tema. Avatarkontrasten, transfer-chippet och kartlegenden är rättade.
- Stjärnorna är radioknappar i en `fieldset`, så nästlade interaktiva element är borta.
- Logisk fokusordning: skip-link, logo, notiser, inställningar, flikar, kort.
- Flikraderna får plats, och notisknappen har `aria-label`.

**Brister (axe-core 4.10, WCAG 2.2 AA)**
- `target-size` (2.5.8): IATA-taggen i flödeskortet är en länk under 24 px (`.checkin__head > .iata-tag`), i båda teman.
- `color-contrast`: `.streak__unit` i ljust tema (`styles/gamification.css:237`, `opacity: .9` på färgad bakgrund) och `.btn--ghost` på Inställningar i mörkt tema.
- Skärmläsare: notislistan har ingen tydlig skillnad mellan läst och oläst utöver visuell stil. Kontrollera att räknaren i klockan läses upp ("10 olästa notiser").

**Åtgärder för 9+**
1. Ge IATA-taggen i kortet en träffyta på minst 24x24 px (eller ta bort den som separat länk, eftersom flygplatsnamnet redan är länk). Ägare: Grafik.
2. Kontrast: ta bort `opacity` på `.streak__unit` och justera `.btn--ghost` i mörkt tema. Ägare: Grafik.
3. Notiser: `aria-label` med "oläst" per rad och räknaren i klockans etikett. Lägg till axe-kontroll i e2e för båda teman. Ägare: Bygg.

## I. Funktionsomfång jämfört med konkurrenterna - 7 (runda 1: 5)

| Funktion | Untappd | Swarm | Letterboxd | Flighty / App in the Air | Gatelog runda 2 |
|---|---|---|---|---|---|
| Snabb check-in (nära mig) | Sök, streckkod | Ja | - | Automatisk från bokning | **Ja, 3 tryck** |
| Följa, vänflöde | Ja | Ja | Ja | Dela flyg | **Ja** |
| Kommentarer | Ja | Ja | Ja | - | **Ja** |
| Notiser | Push | Push | Push | Push | In-app (polling), ingen push |
| Märken med nivåer | Ja, hundratals | Stickers | - | Achievements | **18 x 4 nivåer** |
| Streaks | - | Ja | - | - | **Veckostreak** |
| Topplista per period och bland vänner | Ja | Veckovis bland vänner | - | - | **Ja** |
| Redigera inlägg | Ja | Ja | Ja | Ja | **Ja** |
| Årsöversikt / delbart statistikkort | Ja | Ja | Ja | Ja | API finns (`/card`, `card.svg`), **inget UI** |
| Import av historik | - | - | CSV | E-post, kalender, CSV | Nej |
| Rutter/flyglinjer på karta | - | Karta | - | Ja | Nej |
| Egna listor | Ja | Listor | Ja | - | Endast önskelista |
| Engelska | Ja | Ja | Ja | Ja | Nej |

**Åtgärder för 9+**
1. Årsöversikt i appen ("Ditt 2026") byggd på `/card`, med delning av `card.svg` som bild. Ägare: Bygg + Grafik.
2. Import: CSV från Flighty, App in the Air, OpenFlights och myFlightradar24, plus "lägg till tidigare resor" i bulk. Ägare: Backend + Bygg.
3. Flygningar som par (från-till via "Lägg till anslutning") och rutter på kartan, med "Passport"-statistik (km, längsta flygning). Ägare: Backend + Bygg + Grafik.
4. Web Push (se L). Ägare: Backend + Bygg.
5. Egna listor och i18n (engelska). Ägare: Backend + Bygg.

## J. Gamification-känsla - 7 (runda 1: 5)
**Bättre.**
- XP med nivåer och titlar ("Nivå 7 - Pendlare").
- Veckostreak.
- 18 märken i fyra nivåer (brons till platina) med nya, appspecifika märken: IATA-alfabetet, svenska län, hubbar, främre kabinen, flygbolag.
- Sällsynthet i procent.
- Sammanfattningsskärm med "+10 XP", nivåmätare, streak och milstolpar.
- Märkesnotiser och nivå i UserSummary, så att nivån syns i topplistan.

Detta är i nivå med Swarm och nära Untappd i struktur.

**Brister**
- **För lätta brons- och silvertrösklar.** Demoanvändaren med 10 flygplatser och 14 check-ins har 15 av 18 märken upplåsta, varav Nordisk resenär i platina (`vp-m-light-profile-badges.png`). Efter några veckor finns inget nytt att låsa upp, bara högre nivåer av samma märken. Untappd har hundratals märken och nya varje månad.
- **Inga säsongs- eller tidsbegränsade märken** och inga utmaningar ("Checka in på 3 nya flygplatser i november").
- **Märken kan inte delas** som bild. Märkesupplåsningen på sammanfattningsskärmen är en lista, inte ett ögonblick som i runda 1:s strålande modal.
- **Streaken är veckobaserad**, vilket passar resor. Men "0 veckor i rad" exponeras för de flesta användare (de flesta flyger inte varje vecka), och det finns ingen streak-frys eller månadsstreak som alternativ.
- **Ingen visuell belöning för nivåhöjning** utöver text.

**Åtgärder för 9+**
1. Höj trösklarna (t.ex. nordic 3/4/5 utan platina vid 5 länder, continents 3/4/5/6) och lägg märkesdefinitioner i en datatabell. Släpp minst 10 nya märken per kvartal, inklusive säsong ("Julresenär"), evenemang och flygplatsspecifika märken ("Changi-pilgrim"). Ägare: Backend + Grafik.
2. Månadsutmaningar med egen progress på profilen och i sammanfattningen. Ägare: Backend + Bygg + Grafik.
3. Helskärmsögonblick vid nytt märke eller ny nivå (som runda 1:s modal) med "Dela" som genererar bild. Ägare: Bygg + Grafik.
4. Streak: visa bara när den är större än 0. Lägg till "månader i rad" som sekundär streak och en frys per kvartal. Ägare: Backend + Bygg.

## K. Topplistor - 7 (runda 1: 4)
**Bättre.**
- Sex mått: flygplatser, länder, kontinenter, check-ins, recensioner och XP.
- Perioderna vecka, månad, år och alltid. Vecka är standard, som Swarm.
- Scope Världen, Vänner och Land.
- Egen placering via `me` och `around`, och förändring mot förra perioden.
- Bayesianskt snitt för flygplats- och loungerankning.
- Topplistor finns i mobilmenyn.

**Brister**
- **Ingen egen rad när jag saknar värde.** Veckolistan visar bara de som har check-ins. Då försvinner motivationen att klättra (`vp-m-light-leaderboard.png`, där bara en person syns).
- **Ingen pall för topp 3.** Rankbrickorna ser likadana ut som i runda 1 och förändringen visas som ett ensamt "-".
- **Ingen notis när en vän går om mig** ("Anna gick om dig på veckans topplista"). Det är Swarms starkaste återkomstmotor.
- **Inga flygplatsspecifika listor** för användare ("Flest besök på GOT", Swarms mayorship-motsvarighet). Hemmaplan-märket finns, men ingen tävling om den.
- **Två flikrader och två segmentväljare staplas** (mått, period, scope) och tar halva skärmen innan första raden.

**Åtgärder för 9+**
1. Visa alltid min rad ("Du - 0 flygplatser denna vecka - checka in för att komma med"). Ägare: Bygg.
2. Pall för topp 3 och förändringspilar med färg (upp grön, ner röd, ny "NY"). Ägare: Grafik.
3. Notis `overtaken` för vänlistan per vecka (högst en per vecka och vän). Ägare: Backend + Bygg.
4. "Flygplatsens stammisar": topplista per flygplats på flygplatssidan med "Borgmästare"-titel. Ägare: Backend + Bygg + Grafik.
5. Kompaktare filter: mått som rullgardin, period och scope på en rad. Ägare: Grafik + Bygg.

## L. Socialt samspel - 6 (runda 1: 2)
**Bättre.**
- Följa och avfölja med följarlistor och "Följer dig"-märkning.
- Vänflöde som standard.
- Kommentarer med redigering och borttagning, där ägaren av check-in:en kan ta bort andras kommentarer.
- Notiser för följning, kommentar, gilla, märke och vän på hemmaflygplatsen.
- Delning via Web Share.
- "Vänner som varit här" på flygplatssidan (`friendsVisited`).

Grunden för ett socialt nätverk finns nu.

**Brister**
- **Ingen push.** Notiser syns bara när appen är öppen (polling var 60:e sekund). Utan push uteblir återkomsten som Untappd och Swarm bygger på.
- **Ingen blockering, rapportering eller moderering** (se F).
- **Inget sätt att hitta vänner.** Inga förslag ("personer som besökt samma flygplatser"), ingen inbjudningslänk och ingen kontaktimport. Sök på användarnamn finns, men flödet är tomt för nya användare.
- **Inga @-omnämnanden och ingen "jag var också här".** Inget "ni var på CPH samma dag".
- **Kommentarer bara på check-ins**, inte på loungerecensioner.
- **Delningen saknar förhandsvisning.** Delade länkar ger ingen Open Graph-bild, eftersom SPA:n saknar meta per route, trots att `card.svg` finns.
- **Notiserna saknar avatarer och gruppering** (se A och B).

**Åtgärder för 9+**
1. Web Push via service worker (VAPID, `push_subscriptions`-tabell, inställningar per notistyp). Ägare: Backend + Bygg.
2. Blockera och rapportera (F.2). Ägare: Backend + Bygg.
3. Vänförslag (gemensamma flygplatser, vänners vänner), inbjudningslänk med `?ref=` och tomt vänflöde som visar förslag. Ägare: Backend + Bygg + Grafik.
4. @-omnämnanden i kommentarer med notis, och "samma flygplats samma dag"-notis (opt-in). Ägare: Backend + Bygg.
5. Server-renderade OG-taggar för `/c/:id`, `/u/:username` och `/airport/:iata` (enkel HTML-mall i Express som pekar på `card.svg` eller en check-in-bild). Ägare: Backend + Grafik.

## M. Enkelhet att navigera - 8 (runda 1: 6)
**Bättre.**
- Bottenmenyn är renodlad: Flöde, Sök, en central Checka in-knapp (FAB), Topplistor och Profil.
- Notiser och inställningar ligger i toppfältet på alla sidor.
- Tillbaka-pil på undersidor.
- Kartan är en synlig profilflik, och flikraderna får plats.
- Desktop har sidopanel med genvägar till "Min karta" och "Topplista vänner".

**Brister**
- **Tillbaka-pilen visas på rotflikar** (Profil, Utforska) där den inte hör hemma (`components/Layout.jsx:35-44` avgör bara på historikindex).
- **Sök, Utforska och Topplistor överlappar fortfarande.** Utforska ligger under Sök men har ett eget avsnitt "Topplistor" som dubblerar menyfliken (`vp-m-light-explore.png`). På desktop finns sökfält, "Sök" och "Utforska" samtidigt i toppfältet.
- **Kartan, appens tydligaste "Untappd-för-flygplatser"-yta, kräver Profil -> Karta -> "Stor karta".**
- **Manifestet saknar `shortcuts`.** Långt tryck på ikonen ger inte "Checka in" eller "Min karta". `screenshots` saknas också, så Chrome visar inte det rikare installationsfönstret.

**Åtgärder för 9+**
1. Visa tillbaka-pilen bara på rutter som inte är rotflikar. Ägare: Bygg.
2. Slå ihop Sök och Utforska till en vy (sökfält överst, kategorier under). Ta bort Topplistor-avsnittet där, och ta bort den dubbla sökvägen på desktop. Ägare: Bygg + Grafik.
3. Gör kartan till en direktlänk från profilhuvudet ("0,2 % av världen" som klickbar statistik) och från sidopanelen. Ägare: Bygg.
4. Manifest: `shortcuts` (Checka in, Min karta, Notiser), `screenshots` (mobil och desktop) och `id`. Ägare: Bygg + Grafik.

---

## Sammanställd åtgärdslista per ägare (prioritetsordning)

**Backend**
1. Integritet: privat profil, fördröjd synlighet, opt-in för `home_visit` (F.1).
2. Blockera och rapportera, modereringskö (F.2, L.2).
3. Web Push och sessionsmodell med återkallelse och lösenordsbyte (L.1, F.3).
4. Gruppera notiser och skapa notisen `overtaken` (B.3, E.3, K.3).
5. Märkeströsklar och märkesdefinitioner som data, månadsutmaningar, flygplatsstammisar (J.1, J.2, K.4).
6. OG-taggar per route, import av historik, flygningar som par (L.5, I.2, I.3).
7. Strikt enum-validering, `db.js` uppdelad, delbar rate limit och cache, konsoliderad API.md och CHANGELOG (E.1, E.2, E.4, G.1).

**Grafik**
1. Snedstreckad nolla i brödtext (A.1).
2. Kontrast och träffyta: `.streak__unit`, `.btn--ghost` i mörkt tema, IATA-taggen i kortet (H.1, H.2).
3. Preload av typsnitt (C.2).
4. Kompakt märkesvy, notisrader med avatar eller märkesbild, pall för topp 3, länkar utan understrykning (A.3-A.5, K.2).
5. Ögonblick för nytt märke eller ny nivå, årsöversikt och delbara bilder, manifest-screenshots (J.3, I.1, M.4).

**Bygg**
1. BUG-09, BUG-10 och BUG-11 inklusive felgräns. Förladdning först efter `load` med en perf-gräns i CI (B.1, C.3, D.1).
2. Interaktioner under 200 ms: cachat innehåll direkt, `startTransition` och memo (C.1).
3. Betygsfråga på sammanfattningsskärmen, egen rad i topplistan, streak dold vid 0 (B.2, B.4, A.6).
4. Navigering: tillbaka-pil bara på undersidor, Sök och Utforska sammanslagna, kartan direkt från profilen, manifest-shortcuts (M.1-M.4).
5. Världskarta med zoom till besökta länder och flygplatsprickar (A.2).
6. Fler klienttester (offlinekö, check-in-formulär), JSDoc-typer, märkes-SVG utan stor chunk (D.2-D.4).
7. Klientdelen av integritet, blockering, Web Push, vänförslag och årsöversikt (F.1, L.1-L.4, I.1).

## Källor (konkurrentjämförelse)
- [Untappd: All About Untappd Badges](https://lounge.untappd.com/everything-you-need-to-know-about-untappd-badges)
- [Untappd: Hide Badge Level Cards on Check-in](https://help.untappd.com/hc/en-us/articles/360034490631-How-Can-I-Hide-Badge-Level-Cards-on-Check-in)
- [Flighty: Passport](https://flighty.com/help/passport)
- [9to5Mac: Flighty Year in Review](https://9to5mac.com/2023/12/12/flighty-year-in-review-features/)
- [Engadget: Swarm 4.0 lifelog](https://www.engadget.com/2016-03-24-swarm-4-0.html)
- [Android Central: Swarm leaderboards](https://androidcentral.com/swarm-brings-back-another-old-foursquare-feature-leaderboards-latest-update)
- [Android Central: Swarm mayorships and stickers](https://www.androidcentral.com/swarm-will-make-you-mayor-your-friends-offer-stickers)
