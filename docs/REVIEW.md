# Gatelog - oberoende granskning

Runda 3: 2026-11-15, granskad commit `e4bf3fa` (arbetskatalogen ren). Runda 2: 2026-11-07, `826c6d5`. Runda 1: 2026-11-05, `2aa5d71`.
Granskaren har inte deltagit i bygget. Skala: 9 = i klass med de bästa apparna i kategorin (Untappd, Letterboxd, Swarm, Flighty), 7 = bra och fungerande, 5 = fungerar men med tydliga luckor, 3 = saknas i stort sett.

## Poäng

| Område | Runda 1 | Runda 2 | Runda 3 |
|---|---|---|---|
| A. Visuell design och grafik | 6 | 7 | 8 |
| B. UX och användarvänlighet | 6 | 8 | 8 |
| C. Responsivitet och upplevd snabbhet | 7 | 8 | 7 |
| D. Frontend-kodkvalitet | 7 | 8 | 8 |
| E. Backend-kodkvalitet | 7 | 8 | 8 |
| F. Säkerhet | 7 | 7 | 8 |
| G. Projektstruktur och ordning | 6 | 8 | 8 |
| H. Tillgänglighet | 7 | 8 | 8 |
| I. Funktionsomfång jämfört med konkurrenterna | 5 | 7 | 7 |
| J. Gamification-känsla | 5 | 7 | 7 |
| K. Topplistor | 4 | 7 | 8 |
| L. Socialt samspel | 2 | 6 | 7 |
| M. Enkelhet att navigera | 6 | 8 | 8 |
| **Sammanfattning: Grafik (A) 6 -> 7 -> 8 - Responsivitet (C) 7 -> 8 -> 7 - Enkelhet att navigera (M) 6 -> 8 -> 8 - Gamification (J) 5 -> 7 -> 7 - Topplista (K) 4 -> 7 -> 8 - Socialt samspel (L) 2 -> 6 -> 7** | | | |

Kort dom:
- **Integritet och säkerhet:** lyftet är tydligt. Sessioner med roterande refresh-cookie och återanvändningsdetektering, privat profil, synlighet per check-in, fördröjd publicering, blockering, rapportering och moderering finns nu. Mina sonderingar som främling mot en privat profil läckte inget.
- **Socialt:** Web Push, grupperade notiser med avatarer och följförfrågningar.
- **Grafik:** nollan utan snedstreck, kompakta märken, kartzoom med flygplatsprickar, egen rad i topplistan och betygsfråga efter snabb check-in.

Två saker hindrar högre betyg:

1. **Upplevd snabbhet har gått bakåt.** FCP och LCP är 0,3-0,9 s sämre än i runda 2 på alla sidor.
   - Förhämtningen startar under själva laddningen och hämtar 32 resurser på flödet (207 kB). Två typsnitt förladdas före JS.
   - Check-in-sidan har CLS 0,223: fälten hoppar 394 px när "Senaste" laddas.
   - Interaktionerna är långsammare under throttling (gilla 441-827 ms, navigering 909-1 578 ms).
2. **Det som skiljer kategoriledarna åt saknas fortfarande:**
   - import av resehistorik,
   - rutter på kartan,
   - årsöversikt i appen,
   - vänförslag och inbjudningar,
   - säsongsmärken och utmaningar.

## Metod (runda 3)
- **Läst:** `docs/API.md` (nu sammanhållen v3-referens), `docs/CHANGELOG.md`, `docs/DESIGN.md` och all ändrad kod sedan `a828ec1` (140 filer, +6 600 rader).
- **Kodkvalitet och tester:**
  - `npm run lint`: 0 fel, 0 varningar. Prettier: rent.
  - `npm test`: server 72/72, klient 62/62 (22 filer). `npm run test:api`: 93/93.
- **Körning:** klienten byggd, servern på port 8790 med temporär databas och `seed:demo` (5 användare, 39 check-ins).
- **Skärmdumpar (Playwright):**
  - Pixel 7 ljust och mörkt, 1280 px desktop, 17 sidor.
  - Snabb check-in med mockad position (Landvetter).
  - Tangentbordsordning och axe-core 4.10 (WCAG 2.2 AA) på 12 sidor i båda teman.
- **Prestanda:**
  - CPU 4x och Slow 4G (150 ms RTT, 1,6 Mbit/s), service worker blockerad, två körningar.
  - Nätverksspårning av flödet och spårning av layoutskutt på check-in-sidan.
  - `npm run bench -w server`: 5 000 användare och 300 000 check-ins.
- **Integritetsprov:** två nya konton via API:t. A sätter `isPrivate` och checkar in med kommentaren "zebra". B (främling) och en anonym klient provar 17 vägar.
- **Skärmdumpar:** `/tmp/claude-0/review3/`.
- **Pågående arbete:** test-agentens `v3.spec.js.wip` beskriver BUG-13 (modereringssidan visar "[object Object]" och "@undefined"). Den ingår i bedömningen men styr den inte. BUG-09, BUG-10 och BUG-11 från runda 2 är rättade; deras fixme-tester är borttagna.

## Mätningar

| Sida (kall start, 4x CPU, Slow 4G) | R1 LCP | R2 LCP | R3 FCP | R3 LCP (körning 1 / 2) | R3 CLS | R3 JS över nätet |
|---|---|---|---|---|---|---|
| `/` flöde | 1,30 s | 1,35 s | 1,73-1,85 s | 1,85 / 1,73 s | 0 | 111 kB (R2: 72) |
| `/airport/GOT` | 2,12 s | 1,91 s | 1,66-1,87 s | **2,84** / 2,36 s | 0 | 111 kB |
| `/u/oliver` | 1,48 s | 1,90 s | 1,77-1,82 s | 2,44 / 2,24 s | 0 | 111 kB |
| `/u/oliver/map` | 1,74 s | 1,93 s | 1,57-1,60 s | 2,39 / 2,36 s | 0 | 183 kB |
| `/search` | 1,60 s | 1,48 s | 1,68-1,83 s | 2,28 / **2,50** s | 0 | 111 kB |
| `/leaderboard` | 1,30 s | 1,50 s | 1,86-2,10 s | 2,16 / 2,30 s | 0,001 | 111 kB |
| `/checkin` (inloggad) | - | 0,61 s | 0,54-0,82 s | 1,38 / 0,99 s | **0,223** | 77 kB |

| Interaktion (throttlat) | R1 | R2 | R3 (körning 1 / 2) |
|---|---|---|---|
| Gilla | 297 ms | 281 ms | 827 / 441 ms |
| Flikbyte i flödet | 250 ms | 399 ms | 288 / 477 ms |
| Autocomplete, 3 tangenter inkl. debounce och RTT | 550 ms | 677 ms | 1 074 / 980 ms |
| SPA-navigering flöde -> flygplats | 622 ms | 832 ms | 1 578 / 909 ms |
| Tryck till klar check-in | 5 + 3 tangenter + scroll | 3 | 3 |

| API med 300 000 check-ins (medel / p95) | R1 | R2 | R3 |
|---|---|---|---|
| Autocomplete | 134-142 ms | 10 / 21 ms | 12 / 30 ms |
| Recensionssök | 612 ms | 10 / 21 ms | 13 / 30 ms |
| Topplistor | 263 ms | 11 / 23 ms | 11 / 28 ms |
| Flöde vänner | - | 9 / 23 ms | 8 / 15 ms |
| Seedning av 300 000 check-ins (skrivväg) | - | 133 s | 290 s |

**Orsaker till prestandatappet (spårat):**
- **Förhämtning under laddningen.** `/` hämtar 32 resurser (207 kB) inom cirka 1,7 s på ett obelastat nät.
  - Det inkluderar 9 route-chunks (`preloadNavChunks`) och de andra flödesflikarna.
  - Det inkluderar också `/api/airports/:iata` + `/checkins` för de sex översta korten: 12 API-anrop, `FeedPage.jsx:71-80`.
  - Allt startar via `afterLoadIdle` (`lib/prefetch.js`). Med 4x CPU kommer "idle" direkt efter `load` och konkurrerar med LCP, typsnitt och användarens första tryck.
- **Två typsnitt förladdas före JS** (`client/index.html:10-22`, 32 kB). På 1,6 Mbit/s skjuter det upp JS och därmed FCP.
- **CLS 0,223 på `/checkin`:** QuickPick-listan "Senaste" renderas efter sökfältet och skjuter ned fält, sökfält och disclosure-grupp 394 px vid 1,1 s (spårat med `layout-shift`-källor).

---

## A. Visuell design och grafik - 8 (R1: 6, R2: 7)
**Bättre.**
- **Siffror:** nollan har inte längre snedstreck (`vp-m-light-feed.png`).
- **Märken:** kompakt vy med tre kolumner (`vp-m-light-profile-badges.png`).
- **Notiser:** avatar och typikon per rad, grupperade märkesnotiser med miniatyrer och olästpunkt (`vp-m-light-notifications.png`).
- **Världskartan:** zoomar till besökta länder, visar prickar för besökta flygplatser och har knappen "Hela världen" (`vp-m-light-map.png`).
- **Topplistan:** egen rad med uppmaning (`vp-m-light-leaderboard.png`).
- **Profilen:** understrykning borta på följarräknarna, streak dold vid 0.
- **Sammanfattningsskärmen:** betygsfrågan "Hur var GOT?" (`flow-done-full.png`).
- **Mörkt tema:** konsekvent (`vp-m-dark-profile.png`).

**Brister**
- **"Rapportera" som textknapp på varje kort** i flödet (`vp-m-light-feed.png`, `vp-d-light-feed.png`). Det är den visuellt starkaste åtgärden i kortets fot, starkare än gilla och kommentera. Untappd, Letterboxd och Swarm lägger rapportering i en överflödesmeny.
- **Kartans zoomknappar täcker kartan:** "+", "-" och "Hela världen" ligger över Norge och Finland (`vp-m-light-map.png`).
- **Utforska:** kontinentkorten är cirka 360 px höga, så bara två kontinenter syns per skärm. Fliken "Användare" klipps till "Användar" och sökfältets placeholder klipps (`vp-m-light-explore.png`).
- **Inställningar är en enda sida på cirka 4,5 skärmar** (`full-m-light-settings.png`) med tio sektioner.
- **Notiser:** typikonen täcker halva avatarens initialer ("MJ", "AL").
- **Ingen visuell händelse vid nytt märke eller ny nivå.** Nivåhöjning är text i XP-raden (`DonePage.jsx:87`).

**Åtgärder för 9+**
1. Flytta "Rapportera" (och "Blockera") till en överflödesmeny (`...`) i kortets övre hörn. Ägare: Grafik + Bygg.
2. Kartkontroller i en kompakt grupp nere till höger med 8 px marginal, utanför det besökta området. Ägare: Grafik.
3. Utforska: kontinenter som kompakt horisontell karusell eller två kolumner med 120 px höjd. Gör flikraden scrollbar med fade-kant och korta placeholdern ("Stad, flygplats, IATA"). Ägare: Grafik + Bygg.
4. Inställningar som översiktssida med undersidor (Konto, Integritet, Notiser, Säkerhet, Data). Ägare: Bygg + Grafik.
5. Typikonen i notiser mindre (16 px) och placerad nere till höger utanför initialerna. Ägare: Grafik.
6. Helskärmsögonblick vid nytt märke eller ny nivå med strålar och studs (fanns i runda 1) och "Dela". Ägare: Grafik + Bygg.

## B. UX och användarvänlighet - 8 (R1: 6, R2: 8)
**Bättre.**
- Check-in: 3 tryck och betygsfråga direkt efteråt. Grundflödet håller Swarm-klass.
- BUG-09, BUG-10 och BUG-11 är rättade.
- Sök och Utforska är sammanslagna.
- Inställningar har nu integritet, sessioner, lösenordsbyte, blockerade, export och offlinestatus.

**Brister**
- **Check-in-sidan hoppar 394 px** när "Senaste" laddas (CLS 0,223). Ett tryck på "Sök flygplats" eller en snabbvalsrad under laddningen kan träffa fel element. Det är det viktigaste flödet i appen.
- **"Rapportera" ligger bredvid gilla** i varje kort. Risken för feltryck är stor på mobil, och åtgärden ger fel signal.
- **Integritetsstandard:** nya konton får `defaultVisibility: public` och `publishDelayHours: 0`. Användaren måste själv hitta inställningen för att inte publicera var den är i realtid (se F).
- **Sammanfattningsskärmen:** "Klar" och textlänkarna "Visa GOT · Min profil" ligger under menyn, och knappordningen är otydlig.
- **BUG-13 (test-agenten, pågående):** modereringssidan visar "[object Object]" och "@undefined".

**Åtgärder för 9+**
1. Reservera höjd för QuickPick (skeleton med 3 rader) så att inget flyttas när listan kommer. Lägg till ett perf-test med CLS-gräns 0,05 på `/checkin`. Ägare: Bygg.
2. Rapportera i överflödesmeny (A.1). Ägare: Bygg.
3. Fråga om synlighet i första check-in eller onboarding ("Vem ska se var du är?"), med fördröjning 1 h som förval för publikt. Ägare: Bygg + Backend.
4. Sammanfattningsskärmen: en primärknapp (Dela), en sekundär (Lägg till anslutning) och "Klar" som stor textknapp ovanför menyn. Ägare: Grafik + Bygg.
5. Rätta BUG-13. Ägare: Bygg.

## C. Responsivitet och upplevd snabbhet - 7 (R1: 7, R2: 8)
Backend är fortfarande utmärkt (p95 under 30 ms vid 300 000 check-ins). Klienten har dock tappat mot runda 2 på varje sida och varje interaktion jag mätte, och check-in-sidan har ett tydligt layoutskutt. Betyget sänks därför. Det här är de mätbara krav som stod i API-kontraktets prestandaavsnitt ("inga layoutskutt", LCP under 2,5 s): `/airport/GOT` passerade 2,5 s i en av två körningar, och `/search` låg på gränsen.

**Brister**
- Förhämtning direkt efter `load` (se Mätningar): 9 route-chunks, 2 extra flödesflikar och 12 API-anrop för flygplatser.
- Två typsnitt förladdas före JS (`client/index.html:10-22`).
- CLS 0,223 på `/checkin` (QuickPick).
- Gilla 441-827 ms, autocomplete cirka 1 s och navigering 0,9-1,6 s under 4x CPU. Målet för INP "bra" är under 200 ms.
- Skrivvägen är cirka dubbelt så långsam vid massinsättning (seedning 290 s mot 133 s). Det märks inte per check-in i dag (7-18 ms), men det är en trend att bevaka.

**Åtgärder för 9+**
1. Förhämtning: starta tidigast 3 s efter `load` och bara när `navigator.connection.effectiveType === '4g'` och `saveData` är av. Begränsa till nästa sannolika route (Checka in) i stället för alla nio. Hämta flygplatsdata bara vid pekare eller fokus, aldrig för sex kort i förväg. Ägare: Bygg.
2. Förladda bara rubriktypsnittet (Big Shoulders 800) och ge det `fetchpriority="low"` om LCP är brödtext. Mät båda varianterna. Ägare: Grafik.
3. QuickPick med reserverad höjd (B.1). Ägare: Bygg.
4. Prestandabudget i CI (Playwright-projektet `perf`): LCP under 2,0 s, CLS under 0,05 och gilla under 200 ms vid 4x CPU, med fel om budgeten bryts. Ägare: Bygg.
5. Profilera skrivvägen (triggers för statistik, synlighet och notiser) med `EXPLAIN QUERY PLAN` och sikta på runda 2-nivå. Ägare: Backend.

## D. Frontend-kodkvalitet - 8 (R1: 7, R2: 8)
**Bättre.**
- 62 klienttester (från 16), bland annat för offlinekö, förhämtning, pall och felgräns.
- `RouteErrorBoundary` runt alla routes.
- Gemensamma kodladdare i `routes.js` för `React.lazy` och förhämtning.
- Access-token bara i minnet med automatisk förnyelse.
- JSDoc-typer i `lib/types.js`.
- Märkes-SVG:erna ligger inte längre i en 224 kB-chunk.
- Lint helt rent.

**Brister**
- Förhämtningen är för aggressiv och saknar mätning (se C). Den är testad funktionellt men inte mot prestanda.
- 45 inline-stilar kvar (runda 2: 44).
- BUG-13: modereringssidan förväntar sig andra fältformat än API:t ger (`target` som objekt, `reporter` som sträng). Kontraktet och klienten har inte testats mot varandra för den vägen.

**Åtgärder för 9+**
1. Gör förhämtningen villkorad och mätt (C.1, C.4). Ägare: Bygg.
2. Kontraktstest mellan API och klient för nya vägar: delade exempelsvar från serverns tester som klientens Vitest-tester renderar. Ägare: Bygg + Backend.
3. Ta bort de sista inline-stilarna till klasser. Ägare: Bygg + Grafik.

## E. Backend-kodkvalitet - 8 (R1: 7, R2: 8)
**Bättre.**
- `server/src/db/` är uppdelad i schema, numrerade migreringar (4), statistik-SQL och seed.
- Strikt validering av uppräknade parametrar (400 med `allowed`).
- Sessioner med återanvändningsdetektering (`sessions.js:38-57`).
- Web Push med VAPID, moderering och grupperade notiser.
- 72 enhetstester, 93 API-kanttester och ett benchmark med budget som håller.

**Brister**
- `server/src/db.js` är kvar som kompatibilitetsfil som ingen importerar.
- Rate limit, topplistecache och auth-gräns ligger fortfarande i processminnet. De nollställs vid omstart och delas inte mellan instanser.
- Auth-gränsen räknas per IP (100 per 15 min). Bakom delad NAT, till exempel ett flygplats-wifi eller ett företagsnät, delar alla användare kvoten. Jag låste ute mig själv efter cirka 100 inloggningar från testskripten (se F).
- Skrivvägen är långsammare än i runda 2 (se C).

**Åtgärder för 9+**
1. Ta bort `server/src/db.js`. Ägare: Backend.
2. Gränssnitt för rate limit och cache med SQLite-implementation (delas mellan processer och överlever omstart). Ägare: Backend.
3. Auth-gräns per användarnamn plus IP (t.ex. 10 misslyckade per konto och 15 min) i stället för totalt per IP. Ägare: Backend.
4. Profilera skrivvägen (C.5). Ägare: Backend.

## F. Säkerhet - 8 (R1: 7, R2: 7)
**Bättre.**
- **Sessioner:** access-token 15 min i minnet. Refresh-token i `HttpOnly; SameSite=Strict`-cookie med `path=/api/auth`, rotation och återanvändningsdetektering som återkallar sessionen. Sessionen kontrolleras mot tabellen vid varje anrop.
- **Konto:** "logga ut överallt", lösenordsbyte och en lista med vanliga lösenord.
- **Integritet:** privat profil med följförfrågningar, synlighet per check-in (public/friends/private), fördröjd publicering, dold hemmaflygplats och opt-out för `home_visit`.
- **Moderering:** blockering, rapportering och modereringskö.
- **Integritetsprov:** som främling och som anonym gav en privat profils check-in, kommentarer, karta, check-in-lista, märken, statistikkort och SVG 403 eller 404. Kommentaren "zebra" syntes inte i sök, flygplatsens flöde, globalt flöde eller topplistan.

**Brister**
- **Integritet är opt-in.** Standard är publik synlighet och 0 h fördröjning (`GET /me/settings` för nytt konto). En app som visar var och när någon reser bör ha skyddade standardval (inbyggt dataskydd enligt GDPR artikel 25).
- **Auth-gränsen per IP** kan användas för att låsa ute alla bakom samma NAT (se E).
- **Utloggning kan återkalla andras sessioner.** `POST /auth/logout` återkallar sessionen med det `sid` som står först i cookien, utan att verifiera refresh-hemligheten (`routes/auth.js` logout, `token.split('.')[0]`). Den som känner till någon annans sid kan logga ut den personen. Sid står i klartext i access-tokenens JWT-payload. Verifierat: `Cookie: gl_refresh=<sid>.fake` mot `/auth/logout` gav 204, och offrets access-token gav sedan 401 `session_revoked`. Risken är låg men lätt att stänga.
- **Listan med vanliga lösenord är liten** (cirka 70 poster, `passwords.js`).
- **Ingen tvåfaktorsautentisering.** Det saknas även hos flera konkurrenter, men Flighty och App in the Air kopplar konton till e-post och Apple/Google-inloggning.
- **Modereringsrollen styrs av env** (`MODERATORS`) utan revisionslogg för åtgärder.

**Åtgärder för 9+**
1. Skyddade standardval: `publishDelayHours: 1` för publikt och dold hemmaflygplats. Fråga uttryckligen i onboarding (B.3). Ägare: Backend + Bygg.
2. Logout ska verifiera refresh-hemligheten (samma `rotateRefresh`-kontroll, utan rotation) innan återkallelse. Ägare: Backend.
3. Auth-gräns per konto plus IP (E.3). Ägare: Backend.
4. Utöka lösenordslistan till minst de 10 000 vanligaste, eller använd k-anonymitetskontroll mot HIBP. Ägare: Backend.
5. Revisionslogg för modereringsåtgärder (vem, vad, när). Ägare: Backend.
6. Valfri tvåfaktor (TOTP) eller passkeys (WebAuthn) i Inställningar. Ägare: Backend + Bygg.

## G. Projektstruktur och ordning - 8 (R1: 6, R2: 8)
**Bättre.** `docs/API.md` är en sammanhållen referens med statuskoder, objekt och vägar per resurs. Historiken ligger i `docs/CHANGELOG.md` med brytande ändringar markerade. Servern har tydlig mappstruktur (`src/db/`, `src/routes/`, `sessions.js`, `push.js`, `visibility.js`).

**Brister**
- Ingen LICENSE i roten (påpekat i runda 2).
- `docs/TEST-REPORT.md` är från runda 2 (2026-11-07) och nämner BUG-09/10/11 som öppna. Test-agenten arbetar parallellt, men dokumentationen i HEAD motsäger koden.
- Död fil `server/src/db.js`.
- `tests/e2e/v3.spec.js.wip` ligger i repot med filändelse som inte körs.

**Åtgärder för 9+**
1. Lägg till LICENSE (eller "All rights reserved" uttryckligen). Ägare: Bygg.
2. Uppdatera TEST-REPORT i samma leverans som rättningarna. Låt CI publicera testsammanfattningen så att rapporten inte kan bli inaktuell. Ägare: Bygg (i samråd med test-agenten).
3. Ta bort `server/src/db.js`. Ägare: Backend.

## H. Tillgänglighet - 8 (R1: 7, R2: 8)
**Bättre.** axe-core hittar inga fel på 11 av 12 sidor i båda teman. Kontrasten för `.streak__unit` och `.btn--ghost` i mörkt tema är rättad. Notiser har olästpunkt och bättre etiketter. Fokusordningen är logisk.

**Brister**
- `target-size` (WCAG 2.5.8, allvarlig) kvarstår på IATA-taggen i flödeskortet (`.checkin__head > .iata-tag`, 3-4 noder per sida i båda teman). Den var åtgärdspunkt H.1 i runda 2 och står som rättad i commit `ec6a3b8`, men felet finns kvar.
- "Rapportera" bredvid gilla ökar risken för feltryck för användare med motoriska svårigheter (WCAG 2.5.x-andan).
- Inställningssidans längd (tio sektioner) utan innehållsförteckning eller snabbnavigering är tung för skärmläsare och tangentbord.

**Åtgärder för 9+**
1. IATA-taggen i kortet: `min-width/min-height: 24px` på länken eller gör den till ren dekor (`aria-hidden`, ingen länk), eftersom flygplatsnamnet redan är länk. Ägare: Grafik.
2. Lägg till en axe-kontroll i e2e som fäller bygget på `serious`/`critical`, så att en rättning inte kan gå förbi utan att verifieras. Ägare: Bygg.
3. Inställningar i undersidor eller med ankarnavigering överst (A.4). Ägare: Bygg.

## I. Funktionsomfång jämfört med konkurrenterna - 7 (R1: 5, R2: 7)

| Funktion | Untappd | Swarm | Letterboxd | Flighty / App in the Air | Gatelog R3 |
|---|---|---|---|---|---|
| Snabb check-in (nära mig) | Sök, streckkod | Ja | - | Automatisk från bokning | Ja, 3 tryck |
| Följa, vänflöde, kommentarer | Ja | Ja | Ja | Dela flyg | Ja |
| Push-notiser | Ja | Ja | Ja | Ja | **Ja (Web Push)** |
| Privat profil, blockera, rapportera | Ja | Ja | Ja | - | **Ja** |
| Märken med nivåer | Hundratals, säsong | Stickers | - | Achievements | 18 x 4 nivåer, inga säsongsmärken |
| Streaks | - | Ja | - | - | Veckostreak |
| Topplista per period och bland vänner | Ja | Veckovis bland vänner | - | - | Ja, med pall och "gick om dig" |
| Platsens stammisar (mayorship) | Venue-topplistor | Ja | - | - | Nej |
| Årsöversikt / delbart statistikkort | Ja | Ja | Ja | Ja | API finns (`/card`), **inget UI** |
| Import av historik | - | - | CSV | E-post, kalender, CSV | Nej |
| Rutter/flyglinjer på karta | - | Karta | - | Ja | Nej (prickar per flygplats) |
| Vänförslag, inbjudan | Ja | Kontakter | Ja | - | Nej |
| Egna listor | Ja | Listor | Ja | - | Endast önskelista |
| Engelska | Ja | Ja | Ja | Ja | Nej |

Betyget står still: integritet och push var nödvändiga grundfunktioner, men de *differentierande* funktionerna i jämförelsen (import, rutter, årsöversikt, vänförslag, stammisar) saknas fortfarande.

**Åtgärder för 9+**
1. Årsöversikt "Ditt 2026" byggd på `/users/:u/card?year=`, med delbar bild (`card.svg` eller PNG). Det är lågt hängande frukt, eftersom API:t finns. Ägare: Bygg + Grafik.
2. Import: CSV från Flighty, App in the Air, OpenFlights och myFlightradar24, med förhandsvisning och dubblettkontroll. Ägare: Backend + Bygg.
3. Flygningar som par (från "Lägg till anslutning") och rutter på kartan med Passport-statistik (km, längsta flygning). Ägare: Backend + Bygg + Grafik.
4. Stammisar per flygplats (K.2). Ägare: Backend + Bygg.
5. Engelska (i18n) med svenska som standard. Ägare: Bygg.

## J. Gamification-känsla - 7 (R1: 5, R2: 7)
**Bättre.**
- Höjda trösklar: demoanvändaren har nu 11 av 18 märken mot 15 av 18, och Nordisk resenär har tre nivåer.
- Grupperade märkesnotiser.
- Betygsfrågan efter check-in ger XP.
- Streaken visas bara när den är större än 0.
- Notisen `overtaken` ger tävlingskänsla.

**Brister**
- **Inga säsongs- eller tidsbegränsade märken och inga utmaningar** (inga träffar på "utmaning" eller "challenge" i koden). Efter några månader finns inget nytt att jaga. Untappd släpper nya märken varje månad.
- **Ingen visuell händelse vid nytt märke eller ny nivå** (se A).
- **Märken kan inte delas som bild.**
- **Ingen månadsstreak och ingen streak-frys.** Veckostreaken bryts för nästan alla som inte flyger varje vecka.

**Åtgärder för 9+**
1. Märkesdefinitioner som data, med säsongs- och evenemangsmärken ("Julresenär", "Sommarflygare 2027") och minst 5 nya per kvartal. Ägare: Backend + Grafik.
2. Månadsutmaningar ("3 nya flygplatser i december") med progress på profil och sammanfattning. Ägare: Backend + Bygg + Grafik.
3. Helskärmsögonblick med "Dela" (A.6). Ägare: Grafik + Bygg.
4. Sekundär streak i månader och en frys per kvartal. Ägare: Backend + Bygg.

## K. Topplistor - 8 (R1: 4, R2: 7)
**Bättre.**
- Egen rad med uppmaning när man saknar värde, med "Checka in"-knapp (`vp-m-light-leaderboard.png`).
- Pallkomponent för topp 3 med tester.
- Notisen `overtaken` ("gick om dig").
- Privata profiler döljs i globala listor.
- Sex mått, fyra perioder, tre scope och förändring mot förra perioden.

**Brister**
- Filtren tar fortfarande halva skärmen innan första raden: två rader med måttchips, periodväljare och scopeväljare. Åtgärdspunkt K.5 från runda 2 är inte genomförd.
- Inga stammisar per flygplats ("Flest besök på GOT", Swarms mayorship). Det är den mest naturliga tävlingen för en flygplatsapp.
- Förändringen visas som ett ensamt "-" när den saknas.

**Åtgärder för 9+**
1. Kompakt filter: mått som rullgardin eller ett horisontellt scrollbart chipsfält, period och scope på samma rad. Mål: första listraden synlig ovanför 50 % av skärmhöjden. Ägare: Grafik + Bygg.
2. Stammisar: `GET /airports/:iata/regulars?period=year`, kort på flygplatssidan med "Borgmästare" och notis när man tar över titeln. Ägare: Backend + Bygg + Grafik.
3. Dölj förändringskolumnen när den saknas. Visa "NY" för nya på listan. Ägare: Grafik.

## L. Socialt samspel - 7 (R1: 2, R2: 6)
**Bättre.**
- Web Push via service worker med inställningar per notistyp.
- Följförfrågningar för privata profiler.
- Blockering och rapportering med moderering.
- Grupperade notiser med avatarer.
- Sessionslista med "Avsluta" per enhet.

**Brister**
- **Inget sätt att hitta vänner:** inga förslag, ingen inbjudningslänk och ingen import av kontakter. Nya användare möter ett tomt vänflöde (inga träffar på "suggest" eller "invite" i koden).
- **Inga @-omnämnanden** och inget "ni var på samma flygplats samma dag".
- **Delade länkar saknar förhandsvisning:** inga Open Graph-taggar, trots att `card.svg` finns.
- **Kommentarer bara på check-ins**, inte på loungerecensioner.
- **BUG-13** i moderering.

**Åtgärder för 9+**
1. Vänförslag (gemensamma flygplatser, vänners vänner) och inbjudningslänk med `?ref=`. Ett tomt vänflöde visar förslag. Ägare: Backend + Bygg + Grafik.
2. Server-renderade OG-taggar för `/c/:id`, `/u/:username` och `/airport/:iata` via en enkel HTML-mall i Express. Ägare: Backend + Grafik.
3. @-omnämnanden med notis, och opt-in-notis "samma flygplats samma dag". Ägare: Backend + Bygg.
4. Rätta BUG-13 (D.2). Ägare: Bygg.

## M. Enkelhet att navigera - 8 (R1: 6, R2: 8)
**Bättre.**
- Sök och Utforska är en vy, och bottenmenyn heter nu Flöde, Utforska, Checka in, Topplistor och Profil.
- Tillbaka-pilen visas inte på rotflikar.
- "Karta" är en knapp i profilhuvudet.
- Manifestet har `shortcuts` och `id`.

**Brister**
- **Flikrader klipps:** "Användare" i Utforska (`vp-m-light-explore.png`).
- **Inställningar** har tio sektioner på en sida (A.4).
- **Manifestet saknar `screenshots`**, så Chrome på Android visar inte det rikare installationsfönstret.
- **Utforska börjar med filter och sortering** innan något sökts, så kontinenter och kategorier hamnar under vecket.

**Åtgärder för 9+**
1. Flikrader med horisontell scroll, fade-kant och aktiv flik i vy. Ägare: Grafik + Bygg.
2. Inställningar i undersidor (A.4). Ägare: Bygg.
3. `screenshots` i manifestet (minst en mobil och en desktop). Ägare: Grafik + Bygg.
4. Utforska utan sökterm: visa kategorier och kontinenter direkt. Filter och sortering först när man söker. Ägare: Bygg.

---

## Sammanställd åtgärdslista per ägare (prioritetsordning)

**Bygg**
1. Prestanda: villkorad och fördröjd förhämtning, QuickPick med reserverad höjd (CLS), prestandabudget i CI (C.1, C.3, C.4, B.1).
2. Rapportera och blockera i överflödesmeny (A.1, B.2).
3. Integritetsfrågan i onboarding och skyddade standardval i UI:t (B.3, F.1).
4. BUG-13 och kontraktstester mellan API och klient (B.5, D.2).
5. Årsöversikt "Ditt 2026" på befintligt API (I.1).
6. Inställningar i undersidor, scrollbara flikrader, Utforska utan filter före sökning, manifest-screenshots (A.4, M.1-M.4).
7. Axe-kontroll som fäller bygget, LICENSE, uppdaterad TEST-REPORT (H.2, G.1, G.2).
8. Klientdelen av vänförslag, @-omnämnanden, utmaningar, stammisar och import (L.1, L.3, J.2, K.2, I.2).

**Backend**
1. Skyddade standardval: fördröjning 1 h och dold hemmaflygplats (F.1).
2. Logout verifierar refresh-hemligheten. Auth-gräns per konto plus IP (F.2, F.3, E.3).
3. Delad rate limit och cache (SQLite), ta bort `db.js`, profilera skrivvägen (E.1, E.2, C.5).
4. Större lösenordslista eller HIBP, revisionslogg för moderering, valfri TOTP eller passkeys (F.4-F.6).
5. OG-taggar per route, vänförslag och inbjudan, stammisar per flygplats (L.2, L.1, K.2).
6. Märken som data med säsongsmärken, månadsutmaningar, månadsstreak (J.1, J.2, J.4).
7. Import av historik och flygningar som par för rutter (I.2, I.3).

**Grafik**
1. Förladda bara rubriktypsnittet (C.2).
2. IATA-taggen i kortet minst 24x24 px eller dekorativ (H.1).
3. Kartkontroller utanför kartinnehållet, mindre typikon i notiser (A.2, A.5).
4. Kompakt Utforska och kompakt topplistefilter (A.3, K.1).
5. Helskärmsögonblick för märken och nivåer, delbara märkes- och årskort, OG-bildmallar (A.6, J.3, I.1, L.2).
6. Säsongsmärken och stammis-märke, manifest-screenshots (J.1, K.2, M.3).

## Källor (konkurrentjämförelse)
- [Untappd: All About Untappd Badges](https://lounge.untappd.com/everything-you-need-to-know-about-untappd-badges)
- [Untappd: Hide Badge Level Cards on Check-in](https://help.untappd.com/hc/en-us/articles/360034490631-How-Can-I-Hide-Badge-Level-Cards-on-Check-in)
- [Flighty: Passport](https://flighty.com/help/passport)
- [9to5Mac: Flighty Year in Review](https://9to5mac.com/2023/12/12/flighty-year-in-review-features/)
- [Engadget: Swarm 4.0 lifelog](https://www.engadget.com/2016-03-24-swarm-4-0.html)
- [Android Central: Swarm leaderboards](https://androidcentral.com/swarm-brings-back-another-old-foursquare-feature-leaderboards-latest-update)
- [Android Central: Swarm mayorships and stickers](https://www.androidcentral.com/swarm-will-make-you-mayor-your-friends-offer-stickers)
