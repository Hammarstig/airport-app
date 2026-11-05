# Gatelog - testrapport

Datum: 2026-11-05. Testagent. Testat mot commit `2aa5d71` (backend, klient, grafik) med byggd klient och demodata. Ändringar som andra agenter hade ocommittade i arbetskatalogen under testkörningen (t.ex. typsnitt, inställningssida, offlinekö) ingår inte; kör om sviten när de är committade.

## Sammanfattning

| Svit | Kommando | Tester | Passerade | Fallerade | Markerade fixme (kända fel) | Hoppade (ej relevant för projektet) |
|---|---|---|---|---|---|---|
| Serverns enhetstester | `npm test` | 27 | 27 | 0 | - | - |
| API-kanttester | `npm run test:api` | 49 | 49 | 0 | - | - |
| E2E (Playwright), android + desktop + perf | `npm run test:e2e` | 124 | 107 | 0 | 13 | 4 |

Totalt 200 tester, 183 passerar, 0 fallerar. 13 E2E-tester är `test.fixme` eftersom de träffar riktiga fel (BUG-01 till BUG-06) och ska aktiveras när felen är rättade.

Helhetsbild: backend är robust (auktorisering, validering, FTS-sanering, rate limit och sidindelning håller i alla kantfall). Klienten fungerar i alla huvudflöden på både Android (Pixel 7) och desktop. Prestandan är god med marginal till målen. De viktigaste felen är att CSP blockerar designens typsnitt på varje sida (konsolfel) och att det inte går att logga ut på mobil.

## Testmiljö och körning

- `tests/e2e/playwright.config.js` bygger klienten (`npm run build`) och startar `tests/e2e/server.mjs`, som skapar temporär `DB_PATH` och `UPLOAD_DIR`, kör `seedDemo` och startar `createApp` på port 4173 (env `E2E_PORT`). Katalogen tas bort när servern stoppas.
- Projekt: `android` (devices['Pixel 7'], primärt), `desktop` (1280x800) och `perf` (Pixel 7, körs sist och ensamt via `dependencies`).
- `@playwright/test` 1.63.0 (samma som förinstallerade `playwright`), webbläsare från `PLAYWRIGHT_BROWSERS_PATH`, ingen `playwright install`.
- Foton testas med en riktig JPEG (96x64) som genereras via canvas i webbläsaren och laddas upp med `setInputFiles`.
- `E2E_REUSE_SERVER=1` återanvänder en redan startad server vid lokal felsökning.
- Prestandaresultat skrivs till `test-results/perf.json`.

Filer:
- `tests/e2e/auth.spec.js`, `checkin.spec.js`, `search.spec.js`, `explore.spec.js`, `pwa.spec.js`, `perf.spec.js`, `helpers.js`, `server.mjs`, `playwright.config.js`
- `tests/api/edge.test.mjs`

## Resultat per område

| Område | Resultat | Kommentar |
|---|---|---|
| Registrering | OK | Formulär med hemmaflygplats, klientvalidering, 409 för upptaget namn. |
| Inloggning | OK | Fel lösenord visar fel, rätt lösenord ger toast och profillänk. Skyddad sida skickar till login och tillbaka. Trasig token rensas. |
| Utloggning | Desktop OK, Android FEL | BUG-02. |
| Check-in med alla fält | OK | Flygplats (autocomplete), datum, typ, totalbetyg 4,5 via halvstjärna, delbetyg via tangentbord, kommentar, foto, flygbolag (SK), flightnummer (gemener blir versaler), klass, ny lounge + terminal, loungebetyg. Svaret innehåller alla fält, fotot laddas upp (201) och serveras som `image/jpeg`. |
| Nytt märke-modal | OK | "Första check-in" visas, fokus på "Snyggt!", stängs med knapp och Escape. |
| Synlighet efter check-in | OK | Flygplatssida (kort med detaljer, fotoremsa, galleri, "Du har besökt GOT 1 gång"), loungesida (recension), flöde Alla/Mina, profil (stats, flygplatser, check-ins). |
| Radera check-in | OK | Från profil och från flödets "Mina". Stats uppdateras, API ger 404 efteråt. |
| Gilla/ogilla | OK | Optimistisk uppdatering, sparas över omladdning. Utloggad skickas till login. |
| Önskelista | OK | Lägg till/ta bort på flygplatssidan, syns och försvinner i profilens flik. |
| Flygplatssök | OK | "got" -> GOT först, "stockholm" -> ARN/BMA, "heathrow" -> LHR, "sverige"/"sweden" -> svenska flygplatser, "goteborg" -> GOT. Match-etikett (Land/Stad) i autocomplete. Enter på exakt IATA går till flygplatsen. |
| Tangentbord i autocomplete | OK med två fel | Pilar, aria-activedescendant, Enter och Escape fungerar. BUG-03 och BUG-04. |
| Söksidans flikar och URL-filter | OK | Flikbyte behåller q, pil höger byter flik, land/storlek/sortering i URL och överlever omladdning, "Rensa filter", recensionsfilter (iata, minRating, travelClass) läses från URL. |
| Recensionssök | OK | Träffar markeras med `<mark>`, loungerecensioner visas. |
| XSS i kommentar | OK | `<img src=x onerror=alert(1)>` och `<script>` visas som text i sök, flöde och flygplatssida. Ingen dialog, inga injicerade element. |
| Utforska, land, kategoritopplistor, lounger, resenärstopplista | OK | Sorteringen i kategorilistor är fallande, landsfilter fungerar, loungerecension kan skickas från loungesidan. |
| Märken | OK | 14 märken, låsta/upplåsta, alla ikoner laddas. |
| Karta | OK med datafel | Världskartan ritar över 150 länder och färgar besökta. Växeln reguljär/alla ändrar total (4008/8799) och procent och synkas till URL. Landsvy SE ritar landet, prickar och regiontabell med korrekta länsnamn för reguljärtrafik. BUG-06 för scope=all. |
| PWA | OK med ett fel | Manifest giltigt (any + maskable 192/512 PNG med rätt storlek, theme-color stämmer med meta). Service worker registreras, styr sidan och förcachar app-skalet. Offline ger offlinesidan. Kamera-input har `capture="environment"`. BUG-05. |
| 404 | OK | Okänd route, flygplats, användare, kategori och lounge visar "Fel gate". Okänd API-väg ger JSON 404. |
| Konsolfel | FEL | BUG-01 på varje sida. I övrigt inga konsolfel, sidfel eller misslyckade förfrågningar (16 sidor utloggad + 4 inloggad). |
| Mobil layout | OK | Ingen horisontell sidscroll på 412 px (flikrader scrollar inom sin behållare). |
| API: auktorisering | OK | Andras check-in/foto kan inte raderas (403), uppladdning på annans check-in 403, utan token 401, förfalskad token 401. |
| API: validering | OK | Framtida/ogiltigt datum, rating 0.3/0/5.5/"4", delbetyg 4.5, okänd IATA (QQQ, ESGG, G0T, tom), kommentar 1001 tecken (1000 godkänns), okänt flygbolag, fel klass/flightnummer, lounge från annan flygplats, JSON > 50 kB (413), trasig JSON (400). |
| API: foton | OK | Text och SVG med .jpg-ändelse avvisas (400), > 5 MB ger 413, femte fotot 409, uppladdade filer har nosniff + sandbox-CSP, path traversal 404. |
| API: FTS-injektion | OK | `"`, `*`, `NEAR(`, `(((`, `col:`, `^`, `OR 1=1`, NUL-tecken och mycket långa strängar ger 200/400, aldrig 500. Tom q utan iata 400, med iata 200. Flygplatssök med SQL-liknande indata ger 200. Snippets escapas (även utan q). |
| API: rate limit | OK | 6:e auth-anropet ger 429 med Retry-After, övriga API-vägar påverkas inte. |
| API: stora sidor/offset | OK | limit=100000 kapas till 100, stor offset ger [], negativa/ogiltiga värden ger 200 på 10 listendpoints. |

## Fellista

| Id | Allvarlighet | Fel |
|---|---|---|
| BUG-01 | Hög | CSP blockerar Google Fonts - konsolfel på varje sida och designens typsnitt laddas aldrig |
| BUG-02 | Hög | Det går inte att logga ut på mobil (Android) |
| BUG-03 | Medel | Första tangenttrycket efter ett val i autocomplete tömmer hela fältet |
| BUG-04 | Medel | Enter direkt efter ny inmatning i autocomplete väljer en träff från föregående sökord |
| BUG-05 | Låg | "Försök igen" på offlinesidan gör ingenting (inline-handler blockeras av CSP) |
| BUG-06 | Låg | Fel regionkod/länsnamn i flygplatsdata (GVX "Okänt län", 116 icke-ISO-koder) |
| BUG-07 | Låg | Kartans färgsteg följer inte DESIGN.md |
| BUG-08 | Låg | Offline-navigering visar alltid offlinesidan trots att app-skalet är cachat |

### BUG-01 (Hög) - CSP blockerar Google Fonts
- Steg: öppna valfri sida, t.ex. `/`, och titta i konsolen.
- Förväntat: typsnitten Atkinson Hyperlegible, Big Shoulders Display och IBM Plex Mono laddas (DESIGN.md), inga konsolfel.
- Faktiskt: `Loading the stylesheet 'https://fonts.googleapis.com/css2?...' violates ... style-src 'self' 'unsafe-inline'` på varje sida. Förfrågan stoppas (`requestfailed: csp`) och `document.fonts.check('16px "Atkinson Hyperlegible"')` är false. Appen faller tillbaka på systemtypsnitt, så split-flap-/skyltkaraktären går förlorad.
- Orsak: `client/src/styles/index.css` rad 2 (`@import url("https://fonts.googleapis.com/...")`) mot CSP i `server/src/app.js` rad 31-34 (`style-src 'self' 'unsafe-inline'`, `font-src 'self' data:`).
- Förslag: självhosta typsnitten (woff2 under `client/public` eller `src/assets`, `@font-face` med `font-display: swap`) - bäst för prestanda och integritet. Alternativt lägg till `https://fonts.googleapis.com` i `style-src` och `https://fonts.gstatic.com` i `font-src`. Obs: en render-blockerande `@import` till Google ökar troligen LCP med 200-400 ms på 4G, se prestanda.
- Tester: `pwa.spec.js` "inga konsolfel på någon sida" och "designens typsnitt laddas" (fixme).

### BUG-02 (Hög) - Ingen utloggning på mobil
- Steg: Pixel 7, logga in, leta efter utloggning i bottom-nav, profilen eller någon annanstans.
- Förväntat: utloggning nåbar på Android, som är primär plattform.
- Faktiskt: enda utloggningsknappen ligger i `.topbar__nav` (`client/src/components/Layout.jsx` rad 64-68), som är `display: none` under 768 px (`client/src/styles/layout.css` rad 49). Bottom-nav och profilsidan saknar utloggning.
- Förslag: lägg "Logga ut" på den egna profilsidan (bredvid "Redigera") eller i en profilmeny.
- Test: `auth.spec.js` "utloggning på mobil (Android)" (fixme).

### BUG-03 (Medel) - Autocomplete töms vid redigering efter val
- Steg: `/register` (eller `/checkin`), skriv "stock", välj ARN med Enter, tryck End + Backspace.
- Förväntat: fältet visar "ARN - Stockholm-Arlanda Airpor" och nya förslag kan hämtas.
- Faktiskt: fältet blir tomt efter första tangenttrycket. Samma sak med `fill()`: inskriven text skrivs över med "".
- Orsak: `client/src/components/Combobox.jsx` - `onChange` anropar `onSelect(null)` (rad ca 140), föräldern sätter `value=null`, `selectedText` blir "" och effekten `useEffect(() => setText(selectedText), [selectedText])` (rad ca 40) skriver över texten användaren just skrev.
- Förslag: synka bara `text` från `value` när `value` blir ett nytt objekt (inte när det nollställs av egen inmatning), t.ex. med en ref som markerar att ändringen kommer från input.
- Test: `search.spec.js` "redigering efter val tömmer inte fältet" (fixme).

### BUG-04 (Medel) - Gamla förslag kan väljas under debounce
- Steg: skriv "kastrup" i en flygplats-autocomplete, vänta på förslag, tryck Escape, skriv "heathrow" och tryck direkt Enter.
- Förväntat: inget val (eller LHR när svaret kommit).
- Faktiskt: "CPH - Copenhagen Kastrup Airport" väljs. Listan öppnas direkt med förra sökningens `items` medan den nya är i debounce (150 ms) och nätverk, och Enter/ArrowDown agerar på de gamla träffarna. På långsamt 4G syns fel lista i ca 0,4-0,5 s.
- Orsak: `client/src/components/Combobox.jsx` - `items` rensas inte när `text` ändras; `showList = open && items.length > 0` och `onKey` Enter använder `items[active]` oavsett om `searched === text.trim()`.
- Förslag: visa/välj bara när `searched` motsvarar aktuell inmatning (eller töm `items` vid inmatning).
- Test: `search.spec.js` "Enter direkt efter ny inmatning väljer inte en gammal träff" (fixme).

### BUG-05 (Låg) - Offlinesidans "Försök igen" fungerar inte
- Steg: besök `/`, låt service workern aktiveras, gå offline, navigera till `/explore`, gå online igen, tryck "Försök igen".
- Förväntat: sidan laddas om.
- Faktiskt: inget händer; konsolen visar `Executing inline event handler violates ... script-src 'self'`.
- Orsak: `client/pwa/offline.html` rad 71 `onclick="location.reload()"` mot CSP i `server/src/app.js`.
- Förslag: använd en länk (`<a href="">Försök igen</a>`) eller ett externt skript.
- Test: `pwa.spec.js` "offlinesidans Försök igen laddar om sidan" (fixme).

### BUG-06 (Låg) - Felaktiga regionkoder i flygplatsdata
- Steg: `/u/oliver/map/SE?scope=all` eller `GET /api/users/oliver/map/SE?scope=all`.
- Förväntat: endast riktiga län (ISO 3166-2, API v1.3).
- Faktiskt: raden "Okänt län" (kod `SE-U-A`) med 1 flygplats: GVX Gävle-Sandviken, som ligger i Gävleborgs län (SE-X). Globalt har 116 flygplatser regionkoder som inte är ISO 3166-2 (t.ex. `PF-U-A`, `FO-U-A`, `GI-U-A`, `TW-X-KM`) - arv från OurAirports "U-A" (unassigned). Reguljärtrafikvyn för SE är korrekt (alla 20 län med flygplatser har rätt namn).
- Fil: `server/data/airports.json` (GVX-posten). Förslag: rätta GVX till SE-X/"Gävleborgs län" och mappa "-U-A" till `region: null` så att klientens "Okänd region" används enligt backendens förtydligande.
- Test: `explore.spec.js` "landsvy SE med alla flygplatser har bara riktiga län" (fixme).

### BUG-07 (Låg) - Kartans färgsteg avviker från designkontraktet
- DESIGN.md: 0 % = steg 0, 1-16 = 1, 17-33 = 2, 34-50 = 3, 51-66 = 4, 67-83 = 5, 84-100 = 6.
- Faktiskt: `client/src/pages/Map/atlas.js` `coverageStep` använder <5, <10, <25, <50, <75, >=75 (förklaringen visar "<5 %"... "75-100 %"). Klientens skala är rimligare för låga täckningsgrader, så antingen uppdateras DESIGN.md eller koden. Inget test, beslutsfråga.

### BUG-08 (Låg) - Offline öppnar aldrig det cachade app-skalet
- Service workern sparar `/index.html` vid varje navigering men offline-grenen i `client/pwa/sw.js` (navigate-fallback) returnerar alltid `offline.html`. Appen går därför inte att starta offline alls, inte ens för att visa cachad data. Acceptabelt enligt kravet ("offline-sida"), men en förbättring vore att falla tillbaka på cachad `index.html` och visa offlinesidan bara om skalet saknas.

### Observationer (ej fel)
- Flödets "Alla"-flik och flygplatssidan visar ingen "Radera" på egna check-ins; radering går via "Mina" eller profilen. Kan vara avsiktligt.
- "Topplistor" saknas i mobilens bottom-nav men nås via Utforska -> Resenärer.
- I Playwright på Pixel 7 täcker den fasta bottom-nav knappar som scrollats precis in i vyn; testerna scrollar därför till mitten innan klick (`clickCentered`). För användaren finns tillräcklig bottenmarginal.
- `countries-50m` (233 kB gzip) laddas bara för små länder i landsvyn; Sverige använder 110m-kartan.

## Prestanda

Mätt med Playwright, projekt `perf`: Pixel 7, CPU-throttling 4x (`Emulation.setCPUThrottlingRate`), nätverk 9 Mbps ner / 1,5 Mbps upp / 60 ms RTT (`Network.emulateNetworkConditions`), cache avstängd och service worker blockerad (kall start). Median av 3 körningar per sida. TTI = när sidans huvudinnehåll syns och huvudtråden svarar på en uppgift (proxy, Playwright saknar Lighthouse-TTI).

| Sida | LCP | FCP | Tid till interaktiv | TBT | CLS | JS överfört |
|---|---|---|---|---|---|---|
| `/` | 596 ms | 596 ms | 1 065 ms | 101 ms | 0 | 67 kB |
| `/search` | 624 ms | 496 ms | 1 187 ms | 46 ms | 0 | 72 kB |
| `/airport/GOT` | 840 ms | 500 ms | 1 169 ms | 69 ms | 0 | 75 kB |
| `/u/oliver/map` | 760 ms | 508 ms | 1 243 ms | 145 ms | 0 | 140 kB |

- Autocomplete (tid från sista tangent till första förslag, inkl. 150 ms debounce, throttlat): median 436 ms, max 493 ms (6 sökord).
- JS-storlek: initial JS 65,2 kB gzip (`index` + `vendor`), mål < 200 kB uppfyllt. Totalt alla chunkar 393,9 kB gzip, varav `countries-50m` 233 kB och `countries-110m` 38 kB (laddas bara på kartsidan). Servern levererar JS gzippat.
- Alla mål uppfylls: LCP < 2,5 s med god marginal, inga layoutskutt (CLS 0), kodsplittning per route fungerar (kartbiblioteket laddas bara på kartsidan).
- Förbehåll: mätningen är gjord utan typsnitt eftersom de blockeras (BUG-01). Rättas det med `@import` från Google Fonts tillkommer render-blockerande förfrågningar till två nya domäner; självhostade typsnitt rekommenderas.

## Aktivera fixme-tester

När ett fel är rättat: ta bort raden `test.fixme(true, 'BUG-0x: ...')` i respektive test och kör `npm run test:e2e`. Referenser: BUG-01 `pwa.spec.js` (2 tester), BUG-02 `auth.spec.js`, BUG-03 och BUG-04 `search.spec.js`, BUG-05 `pwa.spec.js`, BUG-06 `explore.spec.js`.
