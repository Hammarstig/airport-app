# Gatelog - oberoende granskning

Datum: 2026-11-05. Granskad commit: `2aa5d71` (plus byggd klient). Granskaren har inte deltagit i bygget.
Skala: 9 = i klass med de bästa apparna i kategorin (Untappd, Letterboxd, Swarm, Flighty), 7 = bra och fungerande, 5 = fungerar men med tydliga luckor, 3 = saknas i stort sett.

## Metod
- Läst `docs/*.md` och hela `server/` och `client/src/` (ca 8 300 rader klient, 2 700 rader server inkl. tester).
- `npm install`, `npm run build`, server på port 8790 med temporär databas, `seed:demo` (4 användare, 32 check-ins). Serverns 27 tester passerar.
- Playwright: Pixel 7 (ljust, mörkt, utloggad) och 1280 px desktop, 16 sidor per variant, plus registrering, tomma tillstånd, check-in-flöde, tangentbord, axe-core 4.10 (WCAG 2.2 AA) och offline.
- Prestanda: CPU 4x + "Slow 4G" (150 ms RTT, 1,6 Mbit/s) via CDP. Lasttest av API:t med 5 000 användare och 300 000 check-ins.
- Skärmdumpar ligger i `/tmp/claude-0/review/` (filnamn anges nedan; de är inte incheckade).
- Konkurrenter: Untappd (check-in, toasts, märken med nivåer, vänflöde), Vivino (etikettskanning, betygsfördelning), Letterboxd (dagbok, listor, följa, årsöversikt), Swarm (närliggande platser, streaks, stickers, veckotopplista bland vänner), Flighty (Passport: livstidsstatistik, rutter på karta, årsöversikt, import), App in the Air (automatisk import från e-post, resestatistik, achievements).

## Poäng

| Område | Betyg |
|---|---|
| A. Visuell design och grafik | 6 |
| B. UX och användarvänlighet | 6 |
| C. Responsivitet och upplevd snabbhet | 7 |
| D. Frontend-kodkvalitet | 7 |
| E. Backend-kodkvalitet | 7 |
| F. Säkerhet | 7 |
| G. Projektstruktur och ordning | 6 |
| H. Tillgänglighet | 7 |
| I. Funktionsomfång jämfört med konkurrenterna | 5 |
| J. Gamification-känsla | 5 |
| K. Topplistor | 4 |
| L. Socialt samspel | 2 |
| M. Enkelhet att navigera | 6 |
| **Sammanfattning: Grafik (A) 6 - Responsivitet (C) 7 - Enkelhet att navigera (M) 6 - Gamification (J) 5 - Topplista (K) 4 - Socialt samspel (L) 2** | |

Kort dom: en välbyggd, snabb och genomtänkt grund med stark visuell idé (split-flap, boardingkort) och ovanligt ren backend. Men den är en "logg" snarare än en social app: socialt lager, topplistor och gamification ligger flera steg efter Untappd och Swarm, och tre buggar syns direkt för användaren (typsnitten blockeras, ingen utloggning på mobil, statistik staplas i en kolumn).

## Kritiska fel (rätta först)
1. **Typsnitten laddas aldrig.** `client/src/styles/index.css:2` importerar Google Fonts, men CSP i `server/src/app.js:31-32` (`style-src 'self'`, `font-src 'self' data:`) blockerar det. Konsolfel på varje sida. Big Shoulders Display, Atkinson Hyperlegible och IBM Plex Mono ersätts av systemtypsnitt, så designkontraktets karaktär försvinner. Ägare: Grafik (självhosta woff2 under `client/public/fonts/` med `@font-face` och `font-display: swap`, subset latin) + Backend (ingen CSP-ändring behövs då).
2. **Ingen utloggning på mobil.** Logga ut-knappen finns bara i `.topbar__nav` (`client/src/components/Layout.jsx:65`), som är `display:none` under 768 px (`client/src/styles/layout.css:49`). Ägare: Bygg.
3. **Statistik staplas i en kolumn på telefon.** `.grid--2/.grid--3` blir tvåkolumn först vid bredare skärm (`layout.css:184-194`), så flygplatssidan (`AirportPage.jsx:84`) och kartsidan (`MapPage.jsx:45`) visar tre siffror under varandra över en hel skärmhöjd (`vp-m-light-airport.png`, `vp-m-light-map.png`). Ägare: Grafik (ny `.stat-row` som alltid är 3 kolumner) + Bygg.
4. **Inloggning tappas vid tillfälligt fel.** `client/src/lib/auth.jsx:19-24` raderar token vid *alla* fel från `/api/me`, även nätverksfel och 5xx. En 502 från en proxy eller ett nätavbrott vid start loggar ut användaren. Endast 401 ska rensa token. Ägare: Bygg.

---

## A. Visuell design och grafik - 6
**Motivering.** Konceptet är starkt och genomfört: split-flap-brickor för IATA, boardingkort med perforering, signalgul landningsbanemarkering, märkena som emaljnålar (`flow-after-checkin.png` är snyggt). Ljust tema är rent och har tydlig palett. Men det som faktiskt renderas saknar sina typsnitt (kritiskt fel 1), hierarkin på mobil är svag och flera ytor ser ut som utkast.

**Brister**
- Flödeskortet är för högt: ett kort per skärm på Pixel 7 (`vp-m-light-feed.png`). Delbetyg som chips, separat resedetaljblock och en egen sidfot med bara ett hjärta. Untappd och Swarm visar 2-3 check-ins per skärm.
- Stat-siffror staplade och betygsstjärnor centrerade fristående under dem (`vp-m-light-airport.png`). På profilen svävar "Snittbetyg givet" centrerat utan koppling (`ProfilePage.jsx:105`, `vp-m-light-profile.png`).
- Kartan: lägsta stegen är svagast (ljust `--map-1` #FCEFA6 på ljusgrått, mörkt `--map-1` #3B3F7A på marinblått). Nästan alla användares länder hamnar i steg 1-2, så kartan ser tom ut (`vp-m-light-map.png`, `vp-m-dark-map.png`). Världskartan zoomar inte in till besökta områden; Sverige är några pixlar stort.
- Mörkt tema: split-flap-brickorna (`--board-tile`) smälter in i `--surface` så att IATA-taggen på korten saknar kontur (`vp-m-dark-feed.png`).
- Rank-brickorna (1, 2, 3) har split-flap-linjen tvärs genom siffran, det ser ut som överstrykning (`vp-m-light-leaderboard.png`).
- Länkar i listor (topplistan, profilens flygplatser, sökresultat) är understrukna i blått eller svart, vilket ger ett "webbformulär"-intryck i en app (`vp-m-light-search.png`).
- Desktop: en 1 100 px bred enkolumn med mycket tomrum, ingen sidopanel (`vp-d-light-feed.png`).
- `theme-color` är fast ljust (`client/index.html:7`, manifest) även i mörkt tema, så Android-statusfältet blir ljust ovanför en mörk app.
- Märkesikoner: API:t skickar emoji (`server/src/badges.js:8-21`) medan klienten har SVG-nålar. Två ikonsystem för samma sak.

**Åtgärder för 9+**
1. Självhosta typsnitten (kritiskt fel 1). Ägare: Grafik.
2. `.stat-row`: 3 kolumner även på 360 px, siffra + etikett, stjärnor inline i snittbetygets cell. Ägare: Grafik; Bygg använder den på flygplats-, profil-, kart- och landssidan.
3. Kompakt flödeskort: rubrikrad (avatar, namn, flygplats, IATA), en rad med typ + betyg + högst 3 viktigaste delbetyg ("+2"), kommentar, foto som stor bild, och en åtgärdsrad (skål/kommentar/dela) utan egen sidfot. Resedetaljer som en enda rad "SK1421 · SAS · Business". Mål: minst 2 kort per skärm på Pixel 7. Ägare: Grafik + Bygg.
4. Kartpalett: gör steg 1 tydligt (t.ex. ljust #F6C744 / mörkt #4C7FD0) och lägg en kontur på besökta länder; auto-zooma (fitBounds) till besökta länder; visa flygplatsprickar på världskartan. Ägare: Grafik (tokens) + Bygg (zoom).
5. Mörkt tema: ge `--board-tile` en 1 px ljusare kant eller skugga. Rank-brickor utan gångjärnslinje. Ägare: Grafik.
6. Listlänkar utan understrykning (hela raden är klickbar, understrykning vid fokus/hover). Ägare: Grafik.
7. `<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#08111E">`. Ägare: Bygg.
8. Ta bort `icon` (emoji) ur märkes-API:t eller byt till asset-id. Ägare: Backend.
9. Desktop: tvåkolumnslayout för flöde (flöde + sidopanel med egen statistik/märkesprogress/topplista). Ägare: Grafik + Bygg.

## B. UX och användarvänlighet - 6
**Motivering.** Autocomplete är riktigt bra (IATA, stad, land, diakritik, "matchade på"-etikett, `flow-autocomplete.png`). Registrering leder direkt till check-in, tomma tillstånd har handlingsknapp (`flow-empty-profile.png`), felmeddelanden är på svenska och fältvalidering fokuserar första felet. Men check-in-flödet har för mycket friktion jämfört med Swarm och Untappd, och centrala saker saknas.

**Check-in-friktion (mätt).** Från flödet: tryck "Checka in" (1), tryck i fältet (2, autofokus öppnar inte tangentbordet pålitligt på Android), skriv "got" (3 tangenter), välj förslag (3), välj stjärnor (4), **scrolla cirka 870 px** (knappen ligger på y = 1 708 px i en 839 px hög vy), tryck "Checka in" (5). Totalt 5 tryck + 3 tangenter + 1-2 scrollningar. Swarm: 2 tryck (närliggande plats, checka in). Untappd: 3-4 tryck.

**Brister**
- Ingen "nära mig"-lista (Geolocation tillåts redan i `Permissions-Policy` men används inte) och inga "senaste/hemma"-flygplatser som snabbval.
- Skicka-knappen ligger efter kommentar, foton och hela resedetaljsektionen (`CheckinPage.jsx:214`). Ingen klistrig knapp.
- Ingen redigering av check-in (bara radering, `CheckinCard.jsx:54`). Loungerecensioner kan varken ändras eller raderas (`server/src/routes/lounges.js`).
- Efter check-in landar man på flygplatssidan; ingen kvittovy ("Din 11:e flygplats, 9:e land, 0,3 % av världen") som Untappd och Swarm visar.
- Ingen flygningsmodell: en resa GOT-CPH-SIN kräver tre separata check-ins utan koppling; flightnummer fylls inte i automatiskt från bolag.
- Ingen utloggning på mobil (kritiskt fel 2).
- Placeholdertexten klipps ("...land eller IA", `vp-m-light-search.png`; desktop "...land" i toppfältet).
- "Typ av besök" med fyra val där "Transfer" och "Mellanlandning" är svåra att skilja för en vanlig resenär; ingen förklaring.
- Halvstjärnor via "tryck på vänster halva" kräver förklaringstext; Untappd använder reglage.

**Åtgärder för 9+**
1. Snabb check-in: överst en rad "Nära dig" (geolocation + `GET /api/airports/nearby?lat&lon`) och "Senaste" (användarens 5 senaste + hemmaflygplats). Ett tryck väljer flygplats. Ägare: Backend (endpoint, enkel bbox + haversine) + Bygg.
2. Klistrig skicka-knapp ovanför bottennavigeringen; flytta foto och resedetaljer in i en hopfälld "Mer"-sektion. Mål: 3 tryck till klar check-in. Ägare: Bygg + Grafik.
3. `PATCH /api/checkins/:id` och redigera-vy; `PATCH/DELETE /api/lounge-reviews/:id`. Ägare: Backend + Bygg.
4. Kvittovy efter check-in med räknare, nya märken, framsteg mot nästa märke och "Dela". Ägare: Bygg + Grafik; Backend lägger `milestones` i POST-svaret.
5. Resa/flygning som begrepp: "Lägg till anslutning" efter check-in som förifyller nästa flygplats och datum. Ägare: Backend + Bygg.
6. Kortare placeholder ("Stad, flygplats eller IATA") och hjälptext för besökstyper. Ägare: Bygg.

## C. Responsivitet och upplevd snabbhet - 7
**Mätningar (Pixel 7, CPU 4x, Slow 4G, kall cache):**

| Sida | FCP | LCP | CLS | JS över nätet |
|---|---|---|---|---|
| `/` flöde | 1,30 s | 1,30 s | 0 | 67 kB |
| `/airport/GOT` | 1,28 s | 2,12 s | 0 | 75 kB |
| `/u/oliver` | 0,98 s | 1,48 s | 0 | 78 kB |
| `/u/oliver/map` | 1,12 s | 1,74 s | 0 | 102 kB |
| `/u/oliver/map/SE` | 0,98 s | 1,52 s | 0 | 102 kB |
| `/search` | 1,29 s | 1,60 s | 0 | 72 kB |
| `/leaderboard` | 1,09 s | 1,30 s | 0 | 70 kB |

Interaktion (INP-proxy, tid från händelse till synlig ändring, throttlat): gilla 297 ms, flikbyte 250 ms, autocomplete 550 ms från första tangent (inkl. 3 tangenter à 60 ms + 150 ms debounce + 150 ms RTT), SPA-navigering flöde till flygplats 622 ms.
API med demodata: 1-8 ms. **API med 300 000 check-ins:** autocomplete 134-142 ms per anrop, `/api/search` 612 ms, `/api/countries` 399 ms, `/api/leaderboard` 263 ms, `/api/rankings/airports` 159 ms.

**Motivering.** Klienten är föredömligt lätt (initial JS 67 kB gzip, mål < 200 kB), kodsplittad per route, noll layoutskutt och stale-while-revalidate-cache. Siffrorna gäller dock *utan* typsnitt (de blockeras); med tre Google-familjer tillkommer 2-3 anrop mot extern domän. Svagheterna ligger i skalning och offline.

**Brister**
- Servern är synkron (`node:sqlite`) och flera frågor aggregerar hela `checkins` per anrop: flygplatssök (`server/src/routes/airports.js:96-97`, subquery `GROUP BY iata` över alla check-ins för varje tangenttryck), `/countries` (`explore.js`), leaderboard (`users.js:280-285`), sök. Vid 300 000 rader blockerar ett sök event-loopen ~0,6 s för alla användare.
- `computeBadges` körs två gånger per check-in och läser användarens alla check-ins (`checkins.js:439, 463`).
- Offline: navigering offline ger bara `offline.html` (`client/pwa/sw.js`), app-skalet och senaste data används inte trots att `index.html` cachas. Route-chunks förcachas inte. Check-in offline (kö) saknas, trots att flygplatser är exakt där man saknar täckning.
- Gilla tar ~300 ms till visuell ändring under throttling, trots optimistisk uppdatering; målet för "INP bra" är < 200 ms.
- Landskartan i högre upplösning är 233 kB gzip (`countries-50m`) och laddas för landsvyer.
- Desktop: fungerar men utnyttjar inte bredden (se A).

**Åtgärder för 9+**
1. Materialiserad statistiktabell `airport_stats(iata, checkins, rating_sum, rating_count, ...)` som uppdateras i samma transaktion som check-in/radering; använd i sök, rankning, länder. Ägare: Backend.
2. Leaderboard från `user_stats`-tabell (unika flygplatser/länder per användare) uppdaterad vid check-in. Ägare: Backend.
3. Märken inkrementellt: beräkna bara de mått check-in:en påverkar, eller cacha per användare. Ägare: Backend.
4. Lasttest i CI (100 000+ check-ins) med budget: autocomplete < 20 ms, sök < 100 ms. Ägare: Backend.
5. Service worker: offline-navigering ska ge app-skalet; förcacha alla route-chunks; cacha senaste API-svar för flöde, profil och flygplatssidor (stale-while-revalidate i SW). Ägare: Bygg.
6. Offline-kö för check-in (IndexedDB + Background Sync eller omförsök vid `online`). Ägare: Bygg.
7. Gilla: uppdatera i samma frame (undvik återrendering av hela listan; `React.memo` på `CheckinCard`, `startTransition` för nätverksdelen). Mål < 100 ms under 4x. Ägare: Bygg.
8. Landsvy: förenkla 50m-geometrin per land eller ladda ett enskilt lands GeoJSON. Ägare: Bygg + Grafik.

## D. Frontend-kodkvalitet - 7
**Motivering.** Tydlig mappstruktur per sida, små filer (största JSX 222 rader), återanvändbara hooks (`useAsync` med generationsräknare mot race conditions, `usePaged`, `useDebounced`), ett gemensamt `api`-lager med `peek`-cache, tillgänglig `Combobox`. Det som drar ned är brist på verktyg och några mönster som döljer fel.

**Brister**
- 142 inline-`style={{...}}` i JSX (t.ex. `AirportAutocomplete.jsx:12-15`, `CheckinPage.jsx:159,164,166`), vilket kringgår designsystemet.
- `eslint-disable`-kommentarer (`CheckinPage.jsx:50,65`, `Combobox.jsx:141`, hooks) men ingen ESLint-konfiguration eller lint-script finns. Effekter med medvetet ofullständiga beroenden är svåra att verifiera.
- Tysta fel: `.catch(() => {})` i `EditProfile.jsx:20`, `SearchPage.jsx:57`, `ReviewsTab.jsx:34`.
- `auth.jsx:19-24` loggar ut vid alla fel (kritiskt fel 4).
- `request()` tömmer hela cachen vid varje POST/DELETE (`api.js:70`), även vid gilla, så nästa vy laddar om allt.
- `dangerouslySetInnerHTML` för sökutdrag (`ReviewsTab.jsx:104`) litar helt på serverns escaping; ett kontrakt mellan två agenter är en skör säkerhetsgräns.
- Inga klienttester (enhet/komponent). Ingen TypeScript eller JSDoc-typer för API-objekten.
- Profilens flik "Karta" är en flik som navigerar bort (`ProfilePage.jsx:39`), vilket bryter tab-mönstret.

**Åtgärder för 9+**
1. ESLint (`eslint-plugin-react-hooks`, `jsx-a11y`) + Prettier, `npm run lint` i rot, inga disable-kommentarer utan motivering. Ägare: Bygg.
2. Flytta inline-stilar till klasser (Grafik lägger till utilities som `.text-sm`, `.flex-1`, `.min-w-0`). Ägare: Bygg + Grafik.
3. Rendera sökutdrag utan `innerHTML`: låt API:t returnera `snippet` som segment `[{text, mark}]`, eller dela strängen på `<mark>` i klienten och rendera React-noder. Ägare: Backend + Bygg.
4. Riktad cache-invalidering (gilla uppdaterar bara posten; check-in invaliderar flöde, profil, flygplats). Ägare: Bygg.
5. Logga/visa fel i stället för tomma `catch`. Ägare: Bygg.
6. Vitest + Testing Library för `Combobox`, `StarsInput`, `submitCheckin`, `useAsync`. JSDoc-typer för `Checkin`, `Airport`. Ägare: Bygg.

## E. Backend-kodkvalitet - 7
**Motivering.** Ren och läsbar: alla frågor parametriserade, whitelistning där SQL interpoleras (sortering, kategori), transaktioner vid check-in, FTS5 med säker frågebyggare (`search.js:83-93`), konsekvent felmodell (`HttpError`, `h()`-wrapper), magic-bytes-kontroll, 27 integrationstester mot `:memory:`, `createApp()` gör det testbart. Svagheten är skalbarhet, migreringar och några luckor i API:t.

**Brister**
- Aggregat över hela tabeller per anrop (se C). `LOUNGE_SELECT` (`airports.js:9-13`) gör två korrelerade subqueries per lounge.
- Migreringar är ad hoc (`ensureColumns` i `db.js:191-230`) utan versionsnummer; ändrade CHECK-villkor eller index på befintliga kolumner går inte att migrera.
- Ingen `PATCH` för check-in, ingen radering/ändring av loungerecension, ingen kontoradering.
- Duplicering: `escapeLike` finns i både `airports.js:26` och `explore.js:11`; `code2` och `countryName` importeras kors och tvärs mellan route-filer; `LOUNGE_SELECT` bor i `airports.js` men används av `lounges.js`.
- Ingen strukturerad loggning eller request-id; 500-fel loggas bara med `console.error`.
- `GET /lounges/:id` returnerar alla recensioner utan paginering.
- Badges räknar `earnedAt` från `visitedOn`, så bakdaterade check-ins ger märken "i dåtid" och `newBadges` kan bli förvirrande.
- Ingen validering av env (t.ex. `JWT_SECRET` i produktion, se F).

**Åtgärder för 9+**
1. Statistiktabeller enligt C.1-C.3 och index för leaderboard. Ägare: Backend.
2. Versionerade migreringar (`schema_version`-tabell + numrerade SQL-filer). Ägare: Backend.
3. Komplettera CRUD: `PATCH /checkins/:id`, `PATCH/DELETE /lounge-reviews/:id`, `DELETE /me`. Ägare: Backend.
4. Bryt ut `server/src/sql/` eller `repos/` (airports, checkins, lounges) så att routes bara validerar och svarar; ta bort dubbletter. Ägare: Backend.
5. Strukturerad loggning (pino eller JSON-rader) med request-id och svarstid. Ägare: Backend.
6. Paginering av loungerecensioner. Ägare: Backend.
7. Validera konfiguration vid start (`config.js`) och vägra starta i produktion utan `JWT_SECRET`. Ägare: Backend.

## F. Säkerhet - 7
**Motivering.** Bättre än genomsnittet för en MVP: bcrypt med tidsutjämning mot okänt konto (`routes/auth.js:298,341`), JWT med låst algoritm (`auth.js:164`), användaren slås upp vid varje anrop, strikt CSP utan `unsafe-inline` för script, `nosniff`, `frame-ancestors 'none'`, uppladdning med magic bytes, slumpade filnamn, egen sandbox-CSP på `/uploads`, ägarkontroll på radering/foton (ingen IDOR hittad), kontrolltecken rensas, FTS-injektion förhindrad, JSON-gräns 50 kB.

**Brister**
- Fallback till hårdkodad nyckel `gatelog-dev-secret-change-me` även när `NODE_ENV=production` (`server/src/auth.js:4-14`); bara en varning. Den som känner till repot kan förfalska token för valfri användare.
- JWT i `localStorage` med 30 dagars livstid och ingen återkallelse; utloggning är bara klientsida. En XSS (eller en komprometterad beroendekedja) ger 30 dagars åtkomst.
- Rate limit endast på `/api/auth`, in-memory och per IP. Check-ins, gilla, loungeskapande och fotouppladdning (5 MB per anrop) är obegränsade, vilket öppnar för spam och diskfyllnad. Utan `TRUST_PROXY` blir `req.ip` proxyns adress, så alla användare delar samma kvot bakom en reverse proxy.
- Foton sparas som de laddas upp. Klienten skalar om (vilket tar bort EXIF), men ett direkt API-anrop kan spara bilder med GPS-koordinater som sedan serveras publikt.
- Alla profiler, kartor och check-in-historik är publika utan val. För en app som loggar var och när någon reser är det en integritetsrisk (förföljelse, inbrottsrisk när man är bortrest) och GDPR-fråga. Ingen kontoradering eller dataexport.
- `dangerouslySetInnerHTML` för sökutdrag (se D).
- Lösenordspolicy: bara minst 8 tecken, ingen kontroll mot läckta lösenord.
- Användarnamnsuppräkning via 409 vid registrering (acceptabelt, men bör vara medvetet).

**Åtgärder för 9+**
1. Vägra starta utan `JWT_SECRET` när `NODE_ENV=production`. Ägare: Backend.
2. Kortlivad access-token (15 min) + refresh-token i `HttpOnly; Secure; SameSite=Strict`-cookie med rotation och server-side återkallelse; utloggning ogiltigförklarar. Ägare: Backend + Bygg.
3. Generell rate limit per användare och IP på skrivande endpoints (t.ex. 60 check-ins/h, 20 foton/h) och daglig lagringskvot per användare; dokumentera `TRUST_PROXY`. Ägare: Backend.
4. Ta bort metadata server-side (avkoda och koda om, eller strippa APP1/EXIF-segment) innan lagring. Ägare: Backend.
5. Integritetsinställningar: privat profil, "dölj senaste 24 h/7 dagar", följare-endast; `DELETE /me` och `GET /me/export`. Ägare: Backend + Bygg.
6. Säker rendering av snippets (D.3). Ägare: Backend + Bygg.
7. `npm audit` i CI (installationen rapporterar sårbarheter i dev-beroenden). Ägare: Bygg.

## G. Projektstruktur och ordning - 6
**Motivering.** Tydliga workspaces (`server/`, `client/`), bra kontraktsdokument i `docs/` med ägarskap per agent, en lockfil i roten, vettiga npm-scripts, byggfiler och databaser gitignorerade.

**Brister**
- Ingen `README.md` i roten (hur man startar, seedar, testar, vilka miljövariabler som finns).
- Ingen `.env.example`; miljövariablerna (`JWT_SECRET`, `DB_PATH`, `UPLOAD_DIR`, `PORT`, `STATIC_DIR`, `TRUST_PROXY`, `CORS_ORIGIN`, `AUTH_RATE_*`) är utspridda i koden och delvis i `docs/API.md`.
- Ingen lint/format-konfiguration, ingen CI (GitHub Actions) som kör test, bygg och e2e.
- `docs/API.md` är en versionslogg (v1, v1.1, v1.2, v1.3, "förtydliganden") snarare än en aktuell referens; man måste läsa allt för att veta vad som gäller.
- `client/src/styles/styleguide.html` ligger bland källfilerna men byggs inte och refereras inte.
- Datakällor kräver attribution: OpenFlights-data är ODbL; ingen attribution i appen eller i en `NOTICE`/README.
- Ingen LICENSE.
- Arbetskatalogen har ocommittade ändringar i `package.json`/`package-lock.json` (från test-agenten) när granskningen gjordes.

**Åtgärder för 9+**
1. `README.md` med snabbstart, scripts, miljövariabler, arkitekturbild och länkar till docs. Ägare: Bygg.
2. `.env.example` + `server/src/config.js` som enda läsare av `process.env`. Ägare: Backend.
3. CI-workflow: `npm ci`, lint, `npm test`, `npm run build`, `npm run test:e2e`, `npm audit --omit=dev`. Ägare: Bygg.
4. Skriv om `docs/API.md` till en konsoliderad referens (eller OpenAPI-fil) och flytta historiken till `CHANGELOG.md`. Ägare: Backend.
5. `NOTICE`/"Om"-sida med attribution (OurAirports, OpenFlights ODbL, Natural Earth/world-atlas). Ägare: Bygg.
6. Flytta `styleguide.html` till `docs/` eller `client/styleguide/`. Ägare: Grafik.

## H. Tillgänglighet - 7
**Motivering.** Ambitiöst grundarbete: `lang="sv"`, skip-link, landmärken, synlig fokus, korrekt ARIA-combobox med `aria-activedescendant`, `aria-pressed` på gilla/önskelista, tabs med `role="tablist"`, felmeddelanden kopplade med `aria-describedby`, `prefers-reduced-motion`, en tabellvy som alternativ till kartan, 48 px träffytor via `::after`. axe hittar inga fel på `/u/oliver`, `/search`, `/explore`.

**Brister (axe-core 4.10, WCAG 2.2 AA)**
- `color-contrast` (allvarligt): vit text på avatarer med vissa `--hue` (flöde 11 noder, topplistan, flygplatssidan), `.kind-chip--transfer` i ljust tema, kartlegendens steg 1-3 (ljust) och 1-6 (mörkt).
- `nested-interactive` (allvarligt): `.stars-input` på `/checkin` har interaktiva element i en interaktiv behållare.
- Flikraderna klipps utan synlig scroll-indikator ("Önsk..." på profilen, "Användare" i sök, "Bäst betyg..." i topplistan), vilket döljer flikar för seende användare och vid 200 % zoom.
- Kartan har inte tangentbordsnavigering mellan länder i SVG:n (tabellen kompenserar delvis).
- Toast-meddelanden försvinner automatiskt; kontrollera att tiden räcker (WCAG 2.2.1) och att de inte är enda bekräftelsen.

**Åtgärder för 9+**
1. Avatarer: beräkna text-/bakgrundsfärg så att kontrasten blir minst 4,5:1 (mörkare bakgrund via fast låg lightness, t.ex. `hsl(var(--hue) 45% 32%)`). Ägare: Grafik.
2. `.kind-chip--transfer` och kartlegendens färger: justera mot 3:1 för grafiska objekt och 4,5:1 för text. Ägare: Grafik.
3. `StarsInput`: en `radiogroup` med `radio`-knappar (halva steg som egna radioval eller ett `input type=range` med tangentbord), ingen nästling. Ägare: Bygg.
4. Flikrader: fade-kant + scroll-snap eller "Mer"-meny; aktiv flik scrollas in i vy. Ägare: Grafik + Bygg.
5. Lägg in axe i e2e-sviten så att regressioner fångas. Ägare: Bygg (i samarbete med test-agenten).

## I. Funktionsomfång jämfört med konkurrenterna - 5
**Motivering.** Kärnan finns och är djupare än i många nischappar: check-in med totalbetyg och sex delbetyg, typ av besök, flygbolag, klass, flightnummer, lounge med betyg, upp till 4 foton från kameran, flygplats-, lounge-, lands- och kategoritopplistor, fulltextsök i recensioner med filter, önskelista, 14 märken, täckningskartor per land och region. Det som definierar kategoriledarna saknas däremot.

| Funktion | Untappd | Swarm | Letterboxd | Flighty / App in the Air | Gatelog |
|---|---|---|---|---|---|
| Snabb check-in (nära mig/skanna) | Ja (sök, streckkod) | Ja, geolokalisering | - | Automatisk från bokning | Nej |
| Följa vänner, vänflöde | Ja | Ja | Ja | Dela flyg | Nej |
| Kommentarer på inlägg | Ja | Ja | Ja | - | Nej |
| Notiser | Ja | Ja | Ja | Ja | Nej |
| Märken med nivåer/säsong | Ja | Stickers | - | Achievements | 14 fasta |
| Streaks | - | Ja | - | - | Nej |
| Topplistor med tidsperiod/vänner | Ja | Veckovis bland vänner | - | - | Nej, bara globalt totalt |
| Årsöversikt / statistikkort att dela | Ja | Ja | Ja | Ja | Nej |
| Import av historik | - | - | CSV | E-post, kalender, CSV | Nej |
| Rutter/flyglinjer på karta | - | Karta | - | Ja | Nej, bara länder |
| Listor (egna samlingar) | Ja | Listor | Ja | - | Endast önskelista |
| Redigera inlägg | Ja | Ja | Ja | Ja | Nej |

**Åtgärder för 9+** (detaljer under B, J, K, L)
1. Socialt lager: följa, vänflöde, kommentarer, notiser (L). Ägare: Backend + Bygg.
2. Import: CSV från Flighty/App in the Air/OpenFlights, samt "lägg till tidigare resor" i bulk. Ägare: Backend + Bygg.
3. Flygningar som entitet (från-till, bolag, flightnummer) och rutter på kartan, "Passport"-statistik (km, timmar i luften, mest besökta, längsta flygning). Ägare: Backend + Bygg + Grafik.
4. Årsöversikt och delbara statistikkort (bild via canvas, Web Share API). Ägare: Bygg + Grafik.
5. Egna listor ("Bästa transferflygplatser", "Lounger med dusch"). Ägare: Backend + Bygg.
6. Engelsk översättning (i18n) för internationell publik. Ägare: Bygg.

## J. Gamification-känsla - 5
**Motivering.** Grunden är bra gjord: märkena är snyggt illustrerade emaljnålar med brons/silver/guld, upplåsning visas direkt efter check-in med strålar och studs (`flow-after-checkin.png`), låsta märken har förloppsmätare, och täckningskartan i procent är i sig en stark motor ("0,2 % av världens flygplatser"). Men systemet är grunt: 14 märken tar slut snabbt för en frekvent resenär, och det finns ingen löpande belöning mellan märkena.

**Jämförelse.** Untappd har tusentals märken med nivåer (Level 1-100), säsongs- och evenemangsmärken, och visar "nivåkort" vid nästan varje check-in. Swarm har stickers som samlas, streaks (dagar/veckor i rad), mayorships bland vänner och en veckotopplista som nollställs. Flighty och App in the Air ger livstidsstatistik som känns som belöning.

**Brister**
- Inga nivåer på märken (t.ex. "Transferkung nivå 1-10"), inga säsongs- eller tidsbegränsade märken, inga sällsynthetsmått ("3 % av resenärerna har detta").
- Inga streaks, ingen XP/nivå för användaren, ingen "nästa mål"-ruta efter check-in.
- Ingen belöning när man inte låser upp ett märke; check-in slutar bara med en toast.
- Märken kan inte delas, och man ser inte vänners märken i flödet.
- Märkesdefinitionerna är hårdkodade i `server/src/badges.js:7-22`, så nya märken kräver deploy.
- `earnedAt` = besöksdatum gör att bakdaterade check-ins kan ge märken som ser gamla ut.
- Inga märken kopplade till appens unika data: lounger per allians, flygbolag (t.ex. "Star Alliance-samlare"), regioner ("Alla län i Sverige"), kontinentscoverage, "nattflyg", "flygplatskod-alfabetet A-Z".

**Åtgärder för 9+**
1. Märken med nivåer (1-10) där tröskeln stiger; nivåkort vid varje check-in som flyttar en mätare. Ägare: Backend (definitioner + progress) + Grafik (nivåramar) + Bygg.
2. Användarnivå/XP baserad på unika flygplatser, länder, recensioner och foton, synlig på profil och i flöde. Ägare: Backend + Bygg + Grafik.
3. Streaks som passar resor: "månader i rad med minst en ny flygplats", "år i rad". Ägare: Backend + Bygg.
4. Minst 40 märken vid lansering inkl. region (alla län/delstater), allians, flygbolag, IATA-alfabet, säsong och "första i appen att checka in på X". Märkesdefinitioner i datatabell. Ägare: Backend + Grafik.
5. Sällsynthet ("12 % har detta") och "Nära att låsa upp" på profilen. Ägare: Backend + Bygg.
6. Delbart märkeskort (PNG via canvas + Web Share). Ägare: Bygg + Grafik.
7. Kvittovy efter check-in med framsteg (B.4). Ägare: Bygg.

## K. Topplistor - 4
**Motivering.** Det finns tre resenärsmått (flygplatser, länder, check-ins), bäst betygsatta flygplatser med kategori-, lands-, kontinent- och storleksfilter, och lounge-topplista. Korrekt `RANK()` vid lika värden. Men topplistorna motiverar inte att klättra.

**Brister**
- Endast global, all-time. Inga tidsperioder (vecka, månad, år) och ingen vänlista. Swarm visar veckotopplista bland vänner, det är det som får folk att återkomma.
- Ingen "din placering" om man ligger utanför topp 50 (`users.js:277-287` returnerar bara toppen). Inga pilar för förändring sedan förra perioden.
- Inga filter per land/hemmaflygplats ("bäst i Sverige", "flest GOT-besök").
- Bäst betygsatta flygplatser använder rått medelvärde med `minRatings=1` (`users.js:290-291`): en flygplats med ett enda 5,0-betyg toppar listan före en med hundra 4,8. Behöver Bayesianskt medelvärde eller högre standardtröskel.
- På mobil nås topplistan bara via Utforska > Resenärer (`Layout.jsx:17`, `desktopOnly`).
- Visuellt: blå understrukna namn och rankbrickor med linje genom siffran (`vp-m-light-leaderboard.png`); ingen pallplats-presentation för topp 3.
- Mått saknas: "% av världen", "kontinenter", "lounger recenserade", "km flugna".

**Åtgärder för 9+**
1. `GET /api/leaderboard?period=week|month|year|all&scope=global|friends|country:SE&metric=...` med `me: {rank, value}` även utanför listan och `delta` mot förra perioden. Ägare: Backend.
2. Flikar Vänner / Sverige / Världen och periodväljare; egen rad markerad och fastnålad i botten. Ägare: Bygg + Grafik.
3. Bayesianskt medelvärde (t.ex. `(C*m + sum) / (C + n)`) för flygplats- och loungerankning, visa antal betyg tydligt. Ägare: Backend.
4. Pall för topp 3, förändringspilar, inga understrukna namn. Ägare: Grafik.
5. Fler mått: % av världen, kontinenter, recensioner, foton. Ägare: Backend.
6. Gör topplistan nåbar med ett tryck på mobil (se M). Ägare: Bygg.

## L. Socialt samspel - 2
**Motivering.** Det enda sociala är gilla på check-ins och ett globalt flöde av alla användare. Det finns ingen relation mellan användare: inga vänner/följare, inga kommentarer, inga notiser (man får aldrig veta att någon gillat ens check-in), ingen delning, ingen "skål"-känsla. Untappd, Letterboxd och Swarm är i grunden sociala nätverk; utan detta lager blir Gatelog en personlig logg med publik data.

**Brister**
- Ingen följ-modell (inga tabeller eller endpoints).
- Flödet "Alla" blir oanvändbart så fort det finns fler än en handfull användare; "Mina" visar bara egna.
- Inga kommentarer på check-ins eller recensioner, inga @-omnämnanden, ingen "jag var också här".
- Inga notiser (in-app eller Web Push, som Android-PWA stöder fullt ut).
- Ingen delning (Web Share API, delbar URL med Open Graph-bild).
- Ingen "vänner som besökt den här flygplatsen" på flygplatssidan, ingen "ni var på samma flygplats samma dag".
- Ingen moderering/rapportering av olämpligt innehåll, vilket krävs innan socialt lager släpps.

**Åtgärder för 9+**
1. Följ-modell: `follows(follower_id, followee_id)`, `POST/DELETE /api/users/:u/follow`, följare/följer-listor, valfritt godkännande vid privat profil. Ägare: Backend + Bygg.
2. Flöde med flikar Vänner (standard) / Alla / Mina; `GET /api/feed?scope=friends`. Ägare: Backend + Bygg.
3. Kommentarer på check-ins (`comments`-tabell, FTS-indexerade), gilla/"skål" med valbar reaktion. Ägare: Backend + Bygg + Grafik.
4. Notiser: tabell + `GET /api/notifications`, badge på profilikonen, Web Push via service worker för gilla, kommentar, ny följare, vän checkade in på din hemmaflygplats. Ägare: Backend + Bygg.
5. Delning: Web Share API för check-in, märken och kartstatistik; server-renderad OG-bild per check-in. Ägare: Bygg + Grafik + Backend.
6. "Vänner som varit här" och "träffade X på CPH samma dag" på flygplatssidan. Ägare: Backend + Bygg.
7. Rapportera/blockera användare och innehåll. Ägare: Backend + Bygg.

## M. Enkelhet att navigera - 6
**Motivering.** Bottennavigering med fem tydliga mål och en framhävd "Checka in" i mitten följer Android-konventioner; aktiv flik markeras; djuplänkar fungerar (`/airport/GOT`, `/u/oliver/map/SE`); scroll till toppen vid sidbyte; tillbaka-knappen fungerar som väntat. Men informationsarkitekturen har överlapp och dolda vägar.

**Brister**
- Sök och Utforska överlappar (båda listar flygplatser, lounger, topplistor), och på desktop finns två sökfält (toppfältet och söksidan).
- Utforska har kartnål-ikon (`IconMapPin`) men innehåller inte kartan; kartan nås bara via en flik på profilen som i själva verket navigerar bort (`ProfilePage.jsx:39,119`) och som ligger utanför synfältet i den klippta flikraden.
- Topplistor saknas i mobilmenyn (`desktopOnly`), utloggning saknas helt på mobil.
- Flikrader klipps utan indikation (profil, sök, topplista), så användare missar Önskelista, Karta och Användare.
- Inga brödsmulor eller tillbaka-knapp i sidhuvudet på djupa sidor (lounge, land, toppkategori); i installerad PWA utan webbläsarens UI är det enda vägen tillbaka Androids systemgest.
- Inget sätt att nå sina egna inställningar (tema, integritet, konto) eftersom ingen inställningssida finns.

**Åtgärder för 9+**
1. Renodla menyn: Flöde, Utforska (sök + kategorier + topplistor i ett), Checka in, Karta (egen flik, egen ikon), Profil. Toppfältets sök blir genväg till Utforska. Ägare: Bygg + Grafik.
2. Inställningssida från profilen (kugghjul): konto, integritet, tema ljust/mörkt/system, logga ut. Ägare: Bygg.
3. Sidhuvud med tillbaka-pil på alla undersidor i standalone-läge (`display-mode: standalone`). Ägare: Bygg + Grafik.
4. Flikrader med scrollindikator och aktiv flik i vy; byt profilens "Karta"-flik mot en riktig flik eller en tydlig knapp. Ägare: Grafik + Bygg.
5. Manifest-genvägar (`shortcuts`) för "Checka in" och "Min karta" så att långt tryck på ikonen på Android går direkt dit. Ägare: Bygg.

---

## Sammanställd åtgärdslista per ägare (prioritetsordning)

**Backend**
1. Vägra starta utan `JWT_SECRET` i produktion (F.1).
2. Statistiktabeller för flygplatser och användare; inkrementella märken; lasttest med budget (C.1-C.4).
3. Följ-modell, vänflöde, kommentarer, notiser, rapportering (L.1-L.4, L.7).
4. Leaderboard med period, vänner, land, egen placering och delta; Bayesianskt medelvärde (K.1, K.3, K.5).
5. `GET /api/airports/nearby`, `PATCH /checkins/:id`, ändra/radera loungerecension, `DELETE /me`, export (B.1, B.3, F.5).
6. Rate limit på skrivande endpoints, lagringskvot, EXIF-strippning (F.3, F.4).
7. Märkesnivåer, XP, streaks, märkesdefinitioner som data (J.1-J.5).
8. Versionerade migreringar, `config.js`, strukturerad loggning, repo-lager (E.2, E.4, E.5, G.2).
9. Snippets som segment i stället för HTML; konsoliderad API-referens (D.3, G.4).

**Grafik**
1. Självhosta typsnitten (A.1).
2. `.stat-row`, kompakt flödeskort, pall för topplistan, listor utan understrykning (A.2, A.3, A.6, K.4).
3. Kontrast: avatarer, transfer-chip, kartlegend; tydligt steg 1 på kartan, kontur för mörka split-flap-brickor (A.4, A.5, H.1, H.2).
4. Märkesnivåramar, delbara märkes- och statistikkort, OG-bildmall (J.1, J.6, I.4).
5. Flikrader med scrollindikator, tillbaka-sidhuvud, ny kartikon i menyn (H.4, M.1, M.3).

**Bygg**
1. Utloggning på mobil, token rensas bara vid 401 (kritiska fel 2 och 4).
2. Snabb check-in (nära mig, senaste), klistrig knapp, kvittovy, redigera (B.1-B.5).
3. Socialt lager i klienten: följ, vänflöde, kommentarer, notiser, Web Push, Web Share (L).
4. Service worker: app-skal offline, förcachade chunks, offline-kö för check-in (C.5, C.6).
5. Ny navigering, inställningssida, manifest-genvägar, `theme-color` för mörkt tema (M.1-M.5, A.7).
6. ESLint/Prettier, Vitest, inline-stilar bort, riktad cache-invalidering, inga tysta `catch` (D.1-D.6).
7. README, CI, NOTICE/attribution (G.1, G.3, G.5).
8. `StarsInput` som radiogroup, axe i e2e (H.3, H.5).

## Källor (konkurrentjämförelse)
- [Untappd: All About Untappd Badges](https://lounge.untappd.com/everything-you-need-to-know-about-untappd-badges)
- [Untappd: Hide Badge Level Cards on Check-in](https://help.untappd.com/hc/en-us/articles/360034490631-How-Can-I-Hide-Badge-Level-Cards-on-Check-in)
- [Untappd: Best Practices](https://help.untappd.com/hc/en-us/articles/360034119811-Best-Practices-to-get-the-Most-Value-out-of-Untappd)
- [Flighty: Passport](https://flighty.com/help/passport)
- [9to5Mac: Flighty Year in Review](https://9to5mac.com/2023/12/12/flighty-year-in-review-features/)
- [Engadget: Swarm 4.0 lifelog](https://www.engadget.com/2016-03-24-swarm-4-0.html)
- [Android Central: Swarm leaderboards](https://androidcentral.com/swarm-brings-back-another-old-foursquare-feature-leaderboards-latest-update)
- [Android Central: Swarm mayorships and stickers](https://www.androidcentral.com/swarm-will-make-you-mayor-your-friends-offer-stickers)
