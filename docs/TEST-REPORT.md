# Gatelog - testrapport

Senast uppdaterad: 2026-11-07 (runda 2, API v2). Testagent. Testat mot commit `570c648` med byggd klient, temporär databas och demodata. Grafikagentens ocommittade ändringar av märkesbilder fanns i arbetskatalogen vid körningen.

## Sammanfattning

| Svit | Kommando | Tester | Passerade | Fallerade | Fixme (kända fel) | Hoppade (ej relevant för projektet) |
|---|---|---|---|---|---|---|
| Serverns enhetstester | `npm test -w server` | 57 | 57 | 0 | - | - |
| Klientens enhetstester (Vitest) | `npm test -w client` | 16 | 16 | 0 | - | - |
| API-kanttester | `npm run test:api` | 56 | 56 | 0 | - | - |
| E2E (Playwright), android + desktop + perf | `npm run test:e2e` | 168 | 158 | 0 | 6 | 4 |

Totalt 297 tester, 287 passerar, 0 fallerar. 6 E2E-tester är `test.fixme` för tre riktiga fel (BUG-09, BUG-10, BUG-11, vardera på android och desktop).

Helhetsbild: v2 fungerar i alla huvudflöden på Android och desktop - snabb check-in, sammanfattningsskärm, följa, kommentarer, notiser, topplistor, redigering, offlinekö, export och radering. Felen från runda 1 är rättade utom BUG-07 (designbeslut). De nya felen gäller kantfall: fel lösenord vid kontoradering loggar ut användaren, och offlinestödet håller inte vid första besöket eller kall start utan nät.

## Ändringar i testerna (runda 2)

21 E2E-tester byggde på v1 och är uppdaterade:
- Check-in: flygplatsen väljs i "Sök flygplats" (eller snabbval) och visas som kort (`.selected-airport`). Stjärnor är radioknappar i en `fieldset` (helpers `setStars`, `openSection` för hopfällda sektioner). Knappen heter "Checka in på XXX" och är inaktiv utan flygplats. Resedetaljer visas som en rad (`.checkin__details`).
- Märkesmodalen är ersatt av sammanfattningsskärmen `/checkin/done`. Märkes-id och antal läses från API:t i stället för att vara hårdkodade.
- Karta är en profilflik (`?tab=map`) med länk till den stora kartan.
- Topplistan har flikarna Resenärer/Flygplatser.
- Två `theme-color` (ljust/mörkt).
- Utloggning via `/settings`.
- Kategoritopplistor sorteras på viktat `score`; testet jämför UI-ordningen med exakt det API-svar sidan fick.
- Rättade fel: BUG-01 (självhostade typsnitt), BUG-02 till BUG-05, BUG-06 (GVX) och BUG-08 (offline visar app-skalet). Deras tester är aktiverade och passerar.

Nya tester i `tests/e2e/v2.spec.js` (21 st per projekt) och 7 nya API-kanttester (v2) i `tests/api/edge.test.mjs`.

## Resultat per område

| Område | Resultat | Kommentar |
|---|---|---|
| Konto, inloggning, utloggning | OK | Utloggning via Inställningar fungerar på mobil och desktop. |
| Check-in med alla fält | OK | Flygbolag, flightnummer, klass, ny lounge + loungebetyg, foto (riktig JPEG), delbetyg och datum i hopfällda sektioner. Stjärnor: klick på vänster/höger halva ger x,5/x,0, nytt klick rensar, piltangenter fungerar. |
| Snabb check-in (3 tryck) | OK | Mockad position (Landvetter): meny -> "Nära dig" (GOT först med avstånd i km) -> "Checka in på GOT". "Senaste" visar hemmaflygplatsen först, sedan senast besökta. Nekad plats visar förklaring och sök fungerar. |
| Sammanfattningsskärm | OK | +XP stämmer med reglerna (195 XP för ny flygplats, nytt land och ny kontinent med kommentar och betyg), nivåhöjning, nivåmätare, streak, milstolpar ("Ny kontinent - din 2:a"), världsandel, nya märken och "Lägg till anslutning" med datum och transfer. |
| Följa och vänflöde | OK | Följ/avfölj med räknare, följarlista, flödet öppnar "Vänner" och visar bara vänner och mig, tom vänflik efter avföljning, "Följer dig"-märkning. |
| Kommentarer | OK | Skriv, redigera ("redigerad"), räknare på kortet, ägaren kan ta bort andras kommentar, utloggad ser kommentarer men uppmanas logga in. API: 1-500 tecken, ägaren kan inte redigera andras kommentarer (403). |
| Notiser | OK | Klockan visar antal olästa (följning, kommentar, gilla och märke), listan visar texterna, allt markeras som läst och räknaren nollställs. |
| Topplistor | OK | Mått, period (vecka visar datumintervall), scope Världen/Vänner/Land (land-väljare med SE), egen placering markerad (`aria-current`) och i API:ts `me`/`around`. XP döljer period och Land. Utloggad ser bara Världen. API: xp/reviews med vecka eller land ger 400. |
| Redigera check-in | OK | Kommentar, betyg och typ ändras, flygplatsen kan inte bytas, kortet märks "redigerad", `editedAt` sätts. Andra användare saknar knappen och får 403 från API:t. |
| Offlinekö | OK med fel | Med service worker aktiv: check-in offline ger "Sparad offline", bannern visar köad post och posten skickas automatiskt när nätet kommer tillbaka. Avvisad post (400) visas i Inställningar med felet och kan tas bort. BUG-10 och BUG-11. |
| Dataexport | OK | Nedladdning `gatelog-export.json` med user, checkins, loungeReviews, comments, wishlist, following, followers. Inga lösenord eller hashar. |
| Radera konto | OK med fel | Rätt lösenord raderar konto, check-ins och inloggning (API 401/404 efteråt). BUG-09 vid fel lösenord. |
| Sök, recensioner, XSS, utforska, märken, karta, 404 | OK | Som i runda 1, anpassat till v2. Märken med nivåram och nivåetikett. |
| PWA | OK | Manifest, service worker, offline visar app-skalet, offlinesidans knapp fungerar, kamera-input. |
| Konsolfel | OK | Inga konsolfel, sidfel eller misslyckade förfrågningar på 16 sidor utloggad och 4 inloggad. Typsnitten laddas. |
| API-kanter | OK | Runda 1 plus v2: följa sig själv 400, notiser/vänflöde/vänlista kräver inloggning, nearby validerar position och begränsar limit/radie, PATCH kan inte ändra iata, `DELETE /me` utan lösenord 400. |

## Fellista

| Id | Allvarlighet | Status | Fel |
|---|---|---|---|
| BUG-11 | Hög | Ny | Offline check-in innan service workern har cachat kraschar appen (vit sida) |
| BUG-09 | Medel | Ny | Fel lösenord vid "Radera konto" loggar ut användaren |
| BUG-10 | Medel | Ny | Efter kall start offline går ingen flygplats att välja |
| BUG-07 | Låg | Öppen | Kartans färgsteg följer inte DESIGN.md |
| BUG-01 | Hög | Rättad | CSP blockerade Google Fonts (typsnitten självhostas nu) |
| BUG-02 | Hög | Rättad | Ingen utloggning på mobil (nu i Inställningar) |
| BUG-03 | Medel | Rättad | Autocomplete tömdes vid redigering efter val |
| BUG-04 | Medel | Rättad | Gamla förslag kunde väljas under debounce |
| BUG-05 | Låg | Rättad | "Försök igen" på offlinesidan blockerades av CSP |
| BUG-06 | Låg | Rättad | GVX hade "Okänt län" |
| BUG-08 | Låg | Rättad | Offline visade alltid offlinesidan |

### BUG-11 (Hög) - Offline check-in kraschar appen innan service workern har cachat
- Steg: första besöket (eller en webbläsare där service workern inte hunnit installeras, t.ex. iOS-Safari utan installerad PWA). Logga in, öppna `/checkin?iata=GOT`, gå offline och tryck "Checka in på GOT".
- Förväntat: "Sparad offline" och posten i kön.
- Faktiskt: hela sidan blir vit. Konsolen: `TypeError: Failed to fetch dynamically imported module: /assets/DonePage-*.js`. Posten hamnar i kön (enqueue sker före navigeringen), men användaren ser en trasig app och kan inte navigera vidare.
- Orsak: `client/src/App.jsx` laddar `DonePage` med `React.lazy` och det finns ingen felgräns (error boundary) runt routes. Samma krasch inträffar vid all klientnavigering offline till en route vars chunk inte är cachad.
- Förslag: förladda `DonePage` när check-in-sidan öppnas (`import()` i en effekt), eller lägg in den i check-in-chunken. Lägg också en felgräns runt `<Suspense>` som visar "Sidan kunde inte laddas offline - försök igen" i stället för vit sida.
- Test: `v2.spec.js` "offline check-in kraschar inte appen" (fixme, körs med `serviceWorkers: 'block'`). Med aktiv service worker passerar offlineflödet, eftersom SW förcachar route-chunkarna.

### BUG-09 (Medel) - Fel lösenord vid kontoradering loggar ut
- Steg: Inställningar -> "Radera konto" -> skriv fel lösenord -> "Radera mitt konto".
- Förväntat: "Fel lösenord." och man är kvar inloggad på inställningssidan.
- Faktiskt: toasten "Fel lösenord." visas, men användaren loggas ut och skickas till `/login`.
- Orsak: `DELETE /api/me` svarar 401 vid fel lösenord (API v2). `client/src/lib/api.js` rad 89 anropar den globala `onUnauthorized` för alla 401 utom `/auth/*`, och `client/src/lib/auth.jsx` rad 29 loggar då ut. `DangerZone.jsx` förväntar sig att 401 betyder fel lösenord.
- Förslag: låt servern svara 403 (eller 400) för fel lösenord på `DELETE /me` och uppdatera API.md. Alternativt undanta `DELETE /me` från den globala 401-hanteringen.
- Test: `v2.spec.js` "fel lösenord vid radering ger felmeddelande och behåller inloggningen" (fixme). API-kanttestet dokumenterar nuvarande 401.

### BUG-10 (Medel) - Ingen flygplats kan väljas efter kall start offline
- Steg: användare med hemmaflygplats och tidigare check-ins öppnar appen online (SW installeras). Stäng och öppna appen igen utan nät och gå till Checka in.
- Förväntat: "Senaste" (och hemmaflygplatsen) går att välja, så att check-in:en kan köas. Det är huvudfallet för offlinekön (flygplatsläge vid ombordstigning).
- Faktiskt: "Senaste" visar "Kunde inte nå servern. Kontrollera anslutningen.", sökningen och `?iata=` kräver API:t och "Nära dig" kräver API:t. Ingen flygplats går att välja, så offlinekön går bara att använda om appen var öppen innan nätet försvann.
- Orsak: `QuickPick.jsx` (`useRecent`) och `useCheckinForm.js` hämtar allt från API:t; minnescachen (`lib/cache.js`) töms vid omstart och service workern cachar inte `/api/`.
- Förslag: spara senaste/hemmaflygplats i IndexedDB (finns redan för kön, `lib/idb.js`) och läs dem offline, och låt `?iata=` falla tillbaka på den sparade posten.
- Test: `v2.spec.js` "kall start offline: flygplats kan väljas från Senaste och köas" (fixme).

### BUG-07 (Låg, öppen) - Kartans färgsteg avviker från designkontraktet
- DESIGN.md: 1-16 % = steg 1 ... 84-100 % = steg 6. `client/src/pages/Map/atlas.js` `coverageStep` använder <5, <10, <25, <50, <75 och >=75. Antingen uppdateras DESIGN.md eller koden. Beslutsfråga, inget test.

### Observationer (ej fel)
- `GET /api/rankings/users` och `/api/rankings/airports` faller tyst tillbaka på standardvärden vid okänt `metric`/`period`/`category` (200) i stället för 400. Konsekvent med v1 men värt att dokumentera i API.md.
- Under hög parallell last kan andras nya betyg ändra kategoritopplistan mellan två anrop. Testet jämför därför mot sidans eget svar.
- Notisen för första check-in ("Du nådde brons i märket Incheckad") kommer med i oläst-räknaren direkt efter första check-in.

## Prestanda

Mätt med Playwright, projekt `perf`: Pixel 7, CPU-throttling 4x, 9 Mbps ner / 1,5 Mbps upp / 60 ms RTT, cache avstängd och service worker blockerad (kall start). Median av 3 körningar. TTI = huvudinnehållet syns och huvudtråden svarar (proxy). Typsnitten är nu självhostade woff2-filer och ingår i mätningen.

| Sida | LCP | FCP | Tid till interaktiv | TBT | CLS | JS överfört | Typsnitt | Runda 1 LCP |
|---|---|---|---|---|---|---|---|---|
| `/` | 616 ms | 616 ms | 1 295 ms | 121 ms | 0 | 72 kB | 4 filer, 65 kB | 596 ms |
| `/search` | 772 ms | 584 ms | 1 150 ms | 81 ms | 0 | 80 kB | 5 filer, 74 kB | 624 ms |
| `/airport/GOT` | 1 144 ms | 584 ms | 1 343 ms | 137 ms | 0 | 80 kB | 4 filer, 65 kB | 840 ms |
| `/u/oliver/map` | 932 ms | 592 ms | 1 253 ms | 136 ms | 0 | 145 kB | 3 filer, 49 kB | 760 ms |

- Autocomplete (sista tangent till första förslag, inkl. 150 ms debounce, throttlat): median 461 ms, max 506 ms.
- JS-storlek: initial JS 70,9 kB gzip (`index` + `vendor`), mål < 200 kB uppfyllt. Totalt 425,6 kB gzip, varav kartdata (laddas bara på kartsidan) är den största delen. Servern levererar JS gzippat.
- Alla mål uppfylls: LCP < 2,5 s, CLS 0. Typsnitten kostar 50-75 kB och lägger till ca 100-300 ms LCP jämfört med runda 1 (då typsnitten blockerades), mest på flygplatssidan där rubriken i Big Shoulders Display är LCP-element. Möjlig förbättring: `<link rel="preload">` för rubriktypsnittet.

## Körning

- `npm run test:e2e` bygger klienten, startar `tests/e2e/server.mjs` (temporär `DB_PATH`/`UPLOAD_DIR`, demodata, port 4173) och kör android, desktop och sist perf. `E2E_REUSE_SERVER=1 E2E_PORT=<port>` återanvänder en startad server.
- Prestandasiffrorna skrivs till `test-results/perf.json`.
- Aktivera fixme-tester: ta bort raden `test.fixme(true, 'BUG-xx: ...')` när felet är rättat. BUG-09, BUG-10 och BUG-11 finns i `tests/e2e/v2.spec.js`.
