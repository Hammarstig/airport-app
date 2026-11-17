# Säkerhetsgranskning av Gatelog

Oberoende granskning (pentest och kodgranskning) av Gatelog, 16-17 november 2026. Granskat läge: `main` vid commit `05afbd5` plus arbetskatalogen för klienten i det skick den hade under granskningen (bygg-agenten arbetade parallellt i `client/`). Granskaren har inte skrivit någon kod i appen och har inte ändrat någon kod; bara denna rapport och testskripten i `tests/security/` har lagts till.

## Så läser du resultatet

Det här avsnittet är skrivet för en CISO eller beslutsfattare som inte har läst koden.

**Betygsskalan 1-10.** Varje område får ett betyg där 10 är bästa tänkbara och 9 motsvarar väl säkrade produktionsappar (t.ex. etablerade konsumenttjänster med eget säkerhetsteam). 8 betyder god nivå med enstaka mindre brister. **7 eller lägre betyder att området måste åtgärdas före bred lansering.** 5-6 betyder att det finns brister som en motiverad angripare kan utnyttja utan särskilda förkunskaper, 4 eller lägre att ett centralt löfte till användaren inte hålls.

**Allvarlighetsgrader.**

| Grad | Betydelse i klartext |
|---|---|
| Kritisk | Kan utnyttjas direkt över nätet och ger kontroll över konton, data eller servern. Stoppa lansering. |
| Hög | Bryter ett uttalat skydd för många användare (t.ex. att privata resor hålls privata) eller ger stor skada med litet arbete. Åtgärda före lansering. |
| Medel | Verklig risk men kräver särskilda förutsättningar (konto, delad enhet, viss konfiguration) eller ger begränsad skada. Åtgärda i närtid. |
| Låg | Härdning, försvar i djupet eller avvikelse mot standard (OWASP ASVS) utan känd direkt skada. Planera in. |

**CVSS 3.1.** Branschstandard som räknar fram en poäng 0-10 ur hur ett fel kan utnyttjas (AV = över nätet eller lokalt, AC = svårighet, PR = om angriparen behöver konto, UI = om offret måste göra något) och vad det påverkar (C = sekretess, I = riktighet, A = tillgänglighet, S = om skadan sprider sig utanför komponenten). Vektorn anges för fynd med grad Medel eller högre. CVSS mäter teknisk skada och **underskattar integritetsskador**: att någon kan se var en namngiven person befinner sig just nu ger bara "C:L" (begränsad sekretessförlust) i CVSS. Två fynd har därför graden Hög trots en CVSS-poäng i mellanskiktet; motiveringen står vid fynden. Kontrollbrister (t.ex. saknad loggning eller ofullständig GDPR-export) har ingen meningsfull CVSS-vektor och markeras "ej tillämplig".

**Områdena i klartext.**

| Område | Vad det handlar om |
|---|---|
| S1 Autentisering och sessioner | Inloggning, lösenord, hur länge man är inloggad, utloggning och skydd mot lösenordsgissning. |
| S2 Auktorisering och åtkomstkontroll | Att man bara kan läsa och ändra det man har rätt till, t.ex. inte radera någon annans check-in. |
| S3 Integritet och dataläckage | Att privata profiler, privata och fördröjda check-ins och dold hemmaflygplats verkligen hålls dolda, via alla vägar. |
| S4 Indatavalidering och injektion | Att inmatad text inte kan bli kod (SQL, HTML, sök-syntax) och att servern inte kan luras att anropa interna adresser (SSRF). |
| S5 Filuppladdning och media | Foton: att bara riktiga bilder godtas och att positionsdata (EXIF/GPS) tas bort. |
| S6 Webbläsarsäkerhet | Skydd i webbläsaren: säkerhetsheaders, CSP, XSS, CSRF, CORS, klickkapning, service worker. |
| S7 Tillgänglighet och DoS | Att en användare inte kan göra tjänsten långsam eller otillgänglig för andra. |
| S8 Beroenden, hemligheter och leveranskedja | Tredjepartsbibliotek med kända sårbarheter, läckta nycklar, CI-flödet. |
| S9 Loggning, felhantering och övervakning | Att intrång och missbruk syns i loggar, och att fel inte läcker intern information. |
| S10 Användarytans säkerhet och integritet | Om användaren förstår sina val, varnas i tid och är skyddad på delad enhet. |
| S11 Dataskydd och GDPR | Rätt till insyn, export och radering (art. 15, 17, 20) och information till användaren. |

**Vad som testades.**

- **Statisk analys:** all serverkod (cirka 5 400 rader i `server/src`) lästes rad för rad, liksom säkerhetsrelevant klientkod (`client/src/lib`, inloggning, inställningar, offlinekö, service worker). Semgrep körde med en lokal regeluppsättning (9 regler: SQL i mallsträngar, DOM-injektion, eval, JWT, hårdkodade hemligheter, sökvägar, omdirigering, ReDoS) eftersom de publika regelpaketen inte gick att hämta. `npm audit` (produktion och full). Hela git-historiken (59 commits) genomsöktes efter nycklar, lösenord och `.env`-filer. Licenser för 140 produktionsberoenden och CI-flödet granskades.
- **Dynamisk testning:** servern byggdes och kördes i produktionsläge (`NODE_ENV=production`, egen JWT-nyckel på 64 tecken, genererade VAPID-nycklar, port 8795, demodata). Testerna följer OWASP ASVS 4.0 nivå 2 och OWASP API Security Top 10 2023.
- **53 automatiska tester** i `tests/security/` (node:test plus ett Playwright-test i riktig Chromium): 31 bekräftar skydd som fungerar och blir regressionstester, 22 visar öppna fynd. Utöver dessa gjordes manuella prov med curl och mätningar (blockerad händelseloop, felsvar, headers).
- **Användarytan** granskades i koden och i webbläsaren (registrering, inställningar, sessioner, inbjudningar, export, radering, utloggning på delad enhet).

**Vad som INTE testades (begränsningar).**

- Driftmiljön: TLS, reverse proxy, brandvägg, backuper, serverhärdning och verklig `TRUST_PROXY`/`PUBLIC_URL`-konfiguration är okända. Bedömningen gäller koden och standardkonfigurationen.
- Riktiga push-tjänster (FCM, Mozilla, Apple) användes inte; utskick fångades i testerna. SSRF-fyndet är bevisat genom att servern godtar och schemalägger adresserna, inte genom ett faktiskt anrop till en intern tjänst.
- Last- och uthållighetstest i stor skala gjordes inte; DoS-fynden bygger på mätning av enskilda anrop.
- Semgreps publika regelpaket (`p/javascript`, `p/nodejsscan`, `p/secrets`) blockerades av nätverksproxyn (HTTP 403). exiftool fanns inte; EXIF verifierades med Pillow och egen bytekontroll.
- Safari/iOS, äldre webbläsare och native-skal testades inte. Service workerns beteende verifierades i Chromium.
- Klientkoden ändrades parallellt av bygg-agenten; senare ändringar kan påverka S6 och S10.
- Ingen social manipulering, ingen granskning av organisation, avtal eller personuppgiftsbiträden.

## Sammanfattning

Gatelog har en ovanligt genomtänkt grund för en app i detta skede: kortlivade access-tokens i minnet, roterande refresh-cookie (HttpOnly, Secure, SameSite=Strict) med stöldupptäckt, sessionskontroll mot databasen vid varje anrop, bcrypt, parametriserad SQL överallt, saniterade FTS5-frågor, strikta säkerhetsheaders, magic byte-kontroll och EXIF-borttagning vid uppladdning. Alla testade BOLA/IDOR-vägar (13 stycken) höll, liksom alla direkta läsvägar för privata och fördröjda check-ins.

**Huvudproblemet är integritet via sidokanaler.** Appen lovar i inställningarna att "en fördröjning gör att ingen ser var du är just nu", men topplistan per land och vecka (SEC-01), vänförslagen (SEC-02) och profilstatistiken (SEC-04) räknar privata och fördröjda check-ins direkt. En anonym besökare kan därmed se att en namngiven användare är i ett visst land just nu, och en inloggad angripare kan ta reda på vilka (även privata profiler) som besökt en viss flygplats. Därtill kommer att en annan användares offlinekö publiceras under nästa konto på en delad enhet (SEC-11), att moderatorrollen kan tas över via ett ledigt användarnamn (SEC-03), blind SSRF via push-adresser (SEC-06), DoS via import (SEC-07) samt brister i GDPR-export, radering och information (SEC-19, SEC-23, SEC-27).

Inga kritiska fynd. **2 Hög, 13 Medel, 16 Låg** (31 fynd). Nio av elva områden har betyget 7 eller lägre (S1, S4, S5 och S8 ligger precis på gränsen); alla har åtgärder i listan nedan.

**Rekommendation:** lansera inte publikt innan SEC-01, SEC-02, SEC-04, SEC-11 och SEC-03 är åtgärdade och regressionstesterna för dem är gröna. Övriga Medel-fynd bör åtgärdas inom en sprint.

## Poängtabell

| Område | Betyg | Kort motivering |
|---|---|---|
| S1 Autentisering och sessioner | **7** | Stark sessionsdesign. Moderatorroll knuten till återanvändbart användarnamn (SEC-03), riktad kontospärr (SEC-16), tunn lösenordslista (SEC-12). |
| S2 Auktorisering och åtkomstkontroll | 8 | All BOLA/IDOR och massilldelning håller. Små existensorakel (SEC-17) och övertagbar push-endpoint (SEC-18). |
| S3 Integritet och dataläckage | **4** | Direkta vägar håller, men topplista, vänförslag och statistik läcker privata/fördröjda resor (SEC-01, SEC-02, SEC-04). |
| S4 Indatavalidering och injektion | **7** | SQL, FTS5, XSS och header-injektion avvärjs. Blind SSRF via push-endpoint (SEC-06), import kringgår textrensning (SEC-20). |
| S5 Filuppladdning och media | **7** | Bra magic byte-kontroll och EXIF-rensning, men data efter bildslut (MPF-andrabild med GPS) behålls (SEC-08); privata foton publikt cachade (SEC-09). |
| S6 Webbläsarsäkerhet | 8 | Strikt script-CSP, frame-ancestors, ingen CORS, Bearer mot CSRF. `unsafe-inline` för stilar, kort HSTS, Host-header i OG (SEC-10, SEC-21). |
| S7 Tillgänglighet och DoS | **6** | Skrivgränser finns, men en import blockerar servern ~1 s och kan upprepas 300 gånger per kvart (SEC-07); inga läsgränser (SEC-22). |
| S8 Beroenden, hemligheter, leveranskedja | **7** | Inga hemligheter i historiken, låsfil, minimala CI-rättigheter. Kritiska/höga sårbarheter i dev-beroenden, actions på taggar, ingen automatisk uppdatering (SEC-24, SEC-25, SEC-26). |
| S9 Loggning, felhantering, övervakning | **6** | Strukturerade loggar utan query-strängar och utan stack traces till klienten. Säkerhetshändelser loggas inte, IP saknas, trasig cookie ger 500 (SEC-14, SEC-15). |
| S10 Användarytans säkerhet och integritet | **5** | Tydliga integritetsval och sessionslista, men offlinekö och push överlever utloggning på delad enhet (SEC-11, SEC-13) och löftet om fördröjning hålls inte. |
| S11 Dataskydd och GDPR | **5** | Export och radering finns men är ofullständiga (SEC-19, SEC-27); integritetspolicy saknas (SEC-23). |

Viktat helhetsbetyg: **6/10.**

## Fynd per område

Varje fynd har ett id (SEC-xx). Fynd med ett automatiskt test är markerade med testfilen; testet påstår det säkra beteendet och står som `todo` tills fyndet är åtgärdat. Kör alla:

```
npm run build
node --disable-warning=ExperimentalWarning --test "tests/security/*.test.mjs"
```

### S1 Autentisering och sessioner (7)

Fungerar (verifierat i `s1-auth.test.mjs`): refresh-cookie `HttpOnly; Secure; SameSite=Strict; Path=/api/auth`; JWT med `alg=none`, fel nyckel, HS512 och manipulerad `sub` avvisas; utloggning, "logga ut alla" och lösenordsbyte slår igenom direkt; återanvänd roterad refresh-token återkallar hela sessionen; samma felmeddelande för okänt konto och fel lösenord, och samma bcrypt-tid via dummy-hash; ny session vid varje inloggning (ingen session fixation); 10 felförsök per konto och IP ger spärr. Inga tokens i URL:er eller loggar.

#### SEC-03 Medel - Moderatorroll knuten till återanvändbart användarnamn
- **CVSS 3.1:** 4.8 `CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:L/I:L/A:N`
- **Var:** `server/src/config.js:62`, `server/src/routes/auth.js:81`, `server/src/routes/social.js:294`
- **Problem:** moderatorer anges som användarnamn i `MODERATORS`. Finns inget konto med namnet (inte skapat ännu eller raderat, användarnamn frigörs vid radering) kan vem som helst registrera det och blir moderator. En moderator ser alla rapporter, och eftersom kommentarer kan rapporteras via id utan synlighetskontroll (SEC-17) kan en kapad moderator läsa innehållet i kommentarer på privata check-ins och radera rapporterat innehåll.
- **Reproduktion:** starta med `MODERATORS=modbob`, `POST /api/auth/register {"username":"modbob",...}` ger `user.isModerator: true` och `GET /api/moderation/reports` ger 200. Test: `s1-auth.test.mjs` "SEC-03".
- **Åtgärd:** lagra roll i databasen (`users.role`) och knyt den till användar-id; sätt via adminkommando, inte via användarnamn. Spärra moderatornamn och nyligen raderade namn från registrering (karenstid).
- **Ägare:** Backend

#### SEC-16 Medel - Riktad kontospärr (lockout-DoS)
- **CVSS 3.1:** 5.3 `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:L`
- **Var:** `server/src/routes/auth.js:132-136`, `server/src/auth.js` (`failureGuard`)
- **Problem:** nyckeln `t:<användarnamn>` spärrar kontot för alla IP-adresser efter 50 felförsök per 15 minuter. Angriparen kan hålla valfritt konto utelåst från offrets egen enhet genom att upprepa 50 gissningar (5 IP-adresser räcker, eftersom varje IP får 100 auth-anrop).
- **Reproduktion:** test `s1-auth.test.mjs` "SEC-16" (med `TRUST_PROXY=1` och `X-Forwarded-For` för att simulera IP-adresser): offret får 429 med rätt lösenord.
- **Åtgärd:** behåll spärr per konto och IP, men ersätt total spärr med ökande fördröjning eller CAPTCHA/proof-of-work per konto; släpp alltid igenom en känd enhet (t.ex. signerad "känd enhet"-cookie eller giltig refresh-cookie).
- **Ägare:** Backend

#### SEC-12 Låg - Lösenordspolicyn känner bara till cirka 70 vanliga lösenord
- **Var:** `server/src/passwords.js:5`
- **Problem:** ASVS 2.1.7 kräver kontroll mot läckta lösenord. `qwerty12`, `football1`, `Summer2026`, `iloveyou1`, `password2`, `Welcome2026` godtas. Rate limiting begränsar onlinegissning, men credential stuffing med läckta listor blir lättare.
- **Reproduktion:** test `s1-auth.test.mjs` "SEC-12".
- **Åtgärd:** använd en lista med minst de 100 000 vanligaste läckta lösenorden (komprimerad Bloom-filter eller k-anonymitet mot HIBP), och mät styrka (zxcvbn) i klienten.
- **Ägare:** Backend

#### SEC-15 Låg - Trasig refresh-cookie ger 500 och stack trace i loggen
- **Var:** `server/src/sessions.js:88` (`decodeURIComponent` utan try/catch)
- **Reproduktion:** `curl -X POST localhost:8795/api/auth/refresh -H 'Cookie: gl_refresh=%E0%A4%A'` ger `500 Internt serverfel` och en felrad med stack i serverloggen. Kan användas för att fylla felloggen. Test: `s1-auth.test.mjs` "SEC-15".
- **Åtgärd:** fånga `URIError` i `parseCookies` och ignorera kakan.
- **Ägare:** Backend

Observation (inget fynd): inom nådatiden på 30 s ger den föregående refresh-token en ny access-token utan att sessionen återkallas. Det är ett medvetet val för flera flikar och acceptabelt.

### S2 Auktorisering och åtkomstkontroll (8)

Fungerar (`s2-access.test.mjs`): annan användare får 403/404 på PATCH/DELETE av check-in, foto, kommentar, loungerecension, session, import och inbjudan, och kan inte ladda upp foton på andras check-ins (ägarskap kontrolleras innan filen tas emot). Notiser kan bara markeras som lästa av ägaren. Moderering kräver roll. Massilldelning: `username`, `id`, `password_hash`, `isModerator`, `user_id`, `source`, `publish_at`, `created_at` i PATCH/POST ignoreras. `__proto__`/`constructor` i JSON förorenar inte `Object.prototype`.

#### SEC-17 Låg - Existensorakel för dolda check-ins och kommentarer
- **Var:** `server/src/routes/checkins.js:269-274` (avgilla), `server/src/routes/social.js:271` (rapport av kommentar)
- **Problem:** `DELETE /api/checkins/:id/like` på en privat check-in ger 200 med gilla-antal i stället för 404. `POST /api/reports` med `type: comment` kontrollerar inte att kommentaren är synlig (201 för befintlig, 404 för saknad), vilket låter angripare räkna upp kommentar-id på privata check-ins och, tillsammans med SEC-03, läsa dem.
- **Reproduktion:** test `s2-access.test.mjs` "SEC-17" (två tester).
- **Åtgärd:** använd `visibleCheckin` i avgilla och i rapport av kommentar (kommentarens check-in måste vara synlig för rapportören).
- **Ägare:** Backend

#### SEC-18 Låg - Push-prenumeration kan tas över av annan användare
- **Var:** `server/src/routes/push.js:38` (`ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id`)
- **Problem:** den som känner till en annan användares endpoint-URL kan registrera den på sitt konto; offret slutar få sina notiser. Endpoint-URL:er är svårgissade, därav Låg.
- **Reproduktion:** test `s2-access.test.mjs` "SEC-18".
- **Åtgärd:** byt ägare bara om anroparen bevisar innehav (samma `auth`-nyckel), eller kräv att den gamla raden först tas bort av ägaren.
- **Ägare:** Backend

### S3 Integritet och dataläckage (4)

Fungerar (`s3-privacy.test.mjs`): privata, vänner-only och fördröjda check-ins döljs för obehöriga i direktläsning, kommentarer, kort-SVG, flöde, sök (FTS-utdrag), profillistor, karta, flygplatssida och OG-taggar. Vänner-check-in syns för godkänd följare. Dold hemmaflygplats (förval) syns inte i profil, användarsök eller följarlistor. Privat profil ger 403 på alla 11 listvägar och döljs i topplistor. Blockering verkar åt båda håll. Push-payload innehåller bara namn och flygplats. Stammisar räknas bara på publika, publicerade check-ins.

#### SEC-01 Hög - Topplistor per land och period visar privata och fördröjda check-ins (realtidsposition)
- **CVSS 3.1:** 5.3 `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N`. Graden höjd till Hög: läckan avslöjar var en namngiven person befinner sig just nu, för alla användare med publik profil, utan inloggning, och bryter appens uttryckliga löfte "en fördröjning gör att ingen ser var du är just nu" (`client/src/pages/Settings/PrivacySection.jsx:69`).
- **Var:** `server/src/routes/rankings.js:92-96` (periodlistor räknar alla rader i `checkins`), `:88` (land, hela tiden, från `user_airports`). `privacyFilter` döljer bara privata profiler, inte privata check-ins.
- **Problem:** `GET /api/rankings/users?scope=country&country=DK&period=week&metric=checkins` listar användaren direkt efter en check-in med `visibility: private` eller med publiceringsfördröjning. Genom att fråga alla länder (cirka 240 anrop, inga läsgränser, SEC-22) kan man följa en persons resor i realtid. Med `period=all` och `scope=country` avslöjas alla länder man någonsin checkat in i privat.
- **Reproduktion:** test `s3-privacy.test.mjs` "SEC-01". Manuellt: registrera konto (publik profil), checka in privat på CPH, anropa URL:en ovan utloggad.
- **Åtgärd:** räkna topplistor bara på check-ins som är `public`, publicerade (`publish_at <= now`) och inte `source = 'import'` i realtid; för vänner-scope använd `checkinVisible`. Bygg separata förberäknade tabeller för "publik statistik" i stället för `user_stats`/`user_airports`.
- **Ägare:** Backend

#### SEC-02 Hög - Vänförslag avslöjar vilka som besökt en flygplats, även privata profiler och privata check-ins
- **CVSS 3.1:** 4.3 `CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:L/I:N/A:N`. Graden höjd till Hög: avslöjar besök på en specifik flygplats för privata profiler med privata check-ins och fördröjning, dvs. de användare som uttryckligen valt högsta skydd.
- **Var:** `server/src/routes/social.js:107-112` (räknar på `user_airports`, som innehåller alla check-ins)
- **Problem:** angriparen checkar in (privat) på en enda flygplats, t.ex. KRN, och `GET /api/me/suggestions` listar alla som också varit där med `sharedAirports`. Genom att radera och göra om check-in (60 per timme) kan man kartlägga besökare flygplats för flygplats.
- **Reproduktion:** test `s3-privacy.test.mjs` "SEC-02": privat profil med `defaultVisibility: private` och 168 h fördröjning föreslås med `sharedAirports: 1`.
- **Åtgärd:** räkna gemensamma flygplatser bara på check-ins som angriparen redan får se (publika och publicerade), exkludera privata profiler som inte följs, och visa inte antal.
- **Ägare:** Backend

#### SEC-04 Medel - Profilstatistik, XP, nivå, märken och användarsök räknar dolda check-ins
- **CVSS 3.1:** 5.3 `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N`
- **Var:** `server/src/routes/users.js:27-53` (stats från `user_stats`, `levelInfo` utanför `canView`), `:143-157` (kort), `server/src/routes/explore.js:165` (`uniqueAirports` i användarsök), `server/src/og.js:339-346` (OG-beskrivning), `server/src/challenges.js:67-75`, `server/src/badges.js` (märken med `earnedAt`)
- **Problem:** `totalCheckins`, `uniqueAirports`, `countries`, XP och nivå ökar direkt vid en privat eller fördröjd check-in. Den som pollar `GET /api/users/<namn>` vet att personen just checkat in, vilket upphäver fördröjningen, och märken som "Nordisk resenär" och utmaningar avslöjar privata resmål. För privata profiler visas XP/nivå ändå, och användarsök visar `uniqueAirports`. Dessutom visas exakt `createdAt` på fördröjda check-ins när de publiceras.
- **Reproduktion:** test `s3-privacy.test.mjs` "SEC-04" (två tester).
- **Åtgärd:** visa för andra bara statistik beräknad på synliga check-ins (separat publik statistik), dölj `levelInfo`, `streak` och märken när `canView` är falsk, ta bort `uniqueAirports` ur användarsök för privata profiler, och visa `publishAt` i stället för `createdAt` för andra än ägaren.
- **Ägare:** Backend

#### SEC-05 Låg - Tittarberoende statistikkort cachas publikt
- **Var:** `server/src/routes/users.js:167`, `:246`
- **Problem:** `/api/users/:u/card` och `card.svg` sätts till `Cache-Control: public, max-age=300` men innehållet beror på tittaren (följare ser vänner-check-ins) och headern sätts före behörighetskontrollen. Bakom en delad cache/CDN kan en följares vy serveras till andra. Saknar `Vary: Authorization`.
- **Reproduktion:** test `s3-privacy.test.mjs` "SEC-05".
- **Åtgärd:** `private, no-cache` när anropet har token; publik cache bara för anonyma svar, eller beräkna korten alltid som anonym tittare.
- **Ägare:** Backend

### S4 Indatavalidering och injektion (7)

Fungerar (`s4-s5-input-upload.test.mjs`): 14 SQL- och FTS5-nyttolaster mot 5 sökvägar plus manipulerade `sort`, `metric`, `category`, `scope`, `iata` och `minRating` ger aldrig 500 och inga data ändras. All SQL är parametriserad; Semgrep hittade 72 mallsträngar i SQL och samtliga interpolerar bara konstanter eller vitlistade kolumnnamn (manuellt genomgånget). XSS i visningsnamn och kommentar escapas i OG-sidor och SVG-kort. `X-Request-Id` valideras. CSV-formler lagras som text och exporten är JSON, så CSV-injektion i export är inte möjlig. Användarnamn begränsas till `[a-z0-9_]`, vilket också stoppar header-injektion i `Content-Disposition`.

#### SEC-06 Medel - Blind SSRF via push-endpoint
- **CVSS 3.1:** 6.1 `CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:C/C:N/I:L/A:L`
- **Var:** `server/src/routes/push.js:8-15` (godtar alla `https:`-URL:er), `server/src/push.js:161-186` (POST vid varje notis)
- **Problem:** servern skickar en POST till prenumerationens endpoint vid varje notis. `https://127.0.0.1:6379/`, `https://169.254.169.254/...`, `https://localhost:8795/api/auth/logout-all`, `https://10.0.0.5/admin`, `https://[::1]/` och godtyckliga externa adresser godtas. Med 10 prenumerationer per konto och notiser som utlöses av andra (gilla, följ) kan servern användas för att nå interna tjänster, portskanna (fel räknas och syns i tidsbeteende) och förstärka trafik mot tredje part.
- **Reproduktion:** test `s6-s7-browser-dos.test.mjs` "SEC-06". Manuellt: `POST /api/push/subscriptions {"endpoint":"https://169.254.169.254/latest/meta-data/","keys":{...}}` ger 201; nästa notis skickas dit.
- **Åtgärd:** vitlista kända push-tjänster (`fcm.googleapis.com`, `updates.push.services.mozilla.com`, `*.notify.windows.com`, `web.push.apple.com`, `*.push.apple.com`), avvisa IP-literaler och privata adresser efter DNS-uppslag, och sätt timeout.
- **Ägare:** Backend

#### SEC-20 Låg - CSV-import kringgår textrensningen
- **Var:** `server/src/routes/imports.js:110`
- **Problem:** kommentarer från import går inte genom `cleanText`, så kontrolltecken (inklusive FTS-markörerna `\u0001`/`\u0002`) och riktningstecken (`‮`) lagras. Ingen XSS (klienten renderar `snippetParts` som text), men förfalskade sökmarkeringar och omvänd text för vilseledning blir möjliga. Riktningstecken rensas inte heller i övriga vägar.
- **Reproduktion:** test `s4-s5-input-upload.test.mjs` "SEC-20".
- **Åtgärd:** kör `cleanText` på importerade kommentarer och utöka `CONTROL` med Unicode-riktningstecken (U+202A-202E, U+2066-2069).
- **Ägare:** Backend

### S5 Filuppladdning och media (7)

Fungerar: bildtyp avgörs av magic bytes (SVG och HTML avvisas oavsett Content-Type), max 5 MB (413), slumpade filnamn med strikt regex, inga sökvägar från användaren, `/uploads` serveras med `nosniff`, `Content-Security-Policy: default-src 'none'; sandbox` och `CORP: same-origin`, så en JPEG/HTML-polyglot kan inte köras. EXIF med GPS och kameramodell tas bort ur JPEG (APP1), PNG (`eXIf`, `tEXt` m.fl.) och WEBP (`EXIF`, `XMP`); verifierat med Pillow-skapade testbilder i `tests/security/fixtures/`.

#### SEC-08 Medel - GPS-EXIF i inbäddad andrabild (MPF/data efter bildslut) behålls
- **CVSS 3.1:** 5.3 `CVSS:3.1/AV:N/AC:H/PR:N/UI:R/S:U/C:H/I:N/A:N`
- **Var:** `server/src/routes/photos.js:92` (allt från första SOS-markören till filslut kopieras orört)
- **Problem:** moderna mobilkameror sparar JPEG med flera bilder (MPF, t.ex. djupkarta eller Ultra HDR-förstärkning) efter den första bildens slutmarkör. Den andra bilden kan ha egen EXIF. Allt efter SOS behålls, så GPS-koordinater i en andrabild publiceras. Hur ofta riktiga telefoner skriver GPS i andrabilden verifierades inte; risken bekräftades med en konstruerad fil.
- **Reproduktion:** test `s4-s5-input-upload.test.mjs` "SEC-08" med `fixtures/mpf.jpg`: lagrad fil innehåller `Exif\0\0` och kameramodellen.
- **Åtgärd:** klipp filen efter första EOI (`FFD9`) efter skanningsdata, ta bort APP2-MPF, eller ännu hellre avkoda och koda om bilden (t.ex. sharp) vilket även löser dimensionsbomber.
- **Ägare:** Backend

#### SEC-09 Låg - Foton på privata check-ins är publika URL:er med lång publik cache
- **Var:** `server/src/routes/photos.js:155` (`maxAge: '7d', immutable`, ingen behörighetskontroll)
- **Problem:** foton nås av vem som helst som har URL:en (128 bitars slump). En URL som en gång delats eller setts av en följare fortsätter fungera efter att check-in blivit privat, och `public, immutable` gör att mellanliggande cachar behåller den i 7 dagar även efter radering.
- **Reproduktion:** test `s4-s5-input-upload.test.mjs` "SEC-09".
- **Åtgärd:** servera foton för ej publika check-ins via en behörighetskontrollerad väg eller kortlivade signerade URL:er, och använd `private` cache.
- **Ägare:** Backend

### S6 Webbläsarsäkerhet (8)

Fungerar (`s6-s7-browser-dos.test.mjs`): `script-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'` plus `X-Frame-Options: DENY` (klickkapning), `nosniff`, `Referrer-Policy: no-referrer`, `COOP`/`CORP same-origin`, `Permissions-Policy`, HSTS i produktion, ingen `X-Powered-By`. Ingen CORS i produktion. API:t kräver Bearer-token och refresh-cookien är SameSite=Strict och begränsad till `/api/auth`, så CSRF är inte möjligt. Klienten använder ingen `innerHTML`/`dangerouslySetInnerHTML` (sökutdrag renderas som React-noder), access-token ligger bara i minnet och gammal token i localStorage migreras bort. Service workern cachar aldrig `/api` eller `/uploads`, så privata svar delas inte mellan användare via SW-cachen. Ingen open redirect hittades (`location.state` kan inte styras från URL).

#### SEC-10 Låg - `style-src 'unsafe-inline'` och för kort HSTS
- **Var:** `server/src/app.js:33`, `:57`
- **Problem:** inline-stilar tillåts (möjliggör CSS-injektion och dataexfiltrering via stilar om HTML-injektion någon gång uppstår). HSTS `max-age=15552000` (180 dagar) understiger ASVS 14.4.5 (minst 15724800) och kraven för preload (ett år). `img-src https:` tillåter bilder från alla domäner.
- **Reproduktion:** test `s6-s7-browser-dos.test.mjs` "SEC-10".
- **Åtgärd:** flytta inline-stilar (`style={{...}}`) till klasser eller använd nonce/hash; HSTS `max-age=31536000; includeSubDomains; preload`; begränsa `img-src` till `'self' data: blob:`.
- **Ägare:** Grafik (stilar), Backend (headers)

#### SEC-21 Låg - Open Graph-taggar byggs från Host-headern
- **Var:** `server/src/app.js:165`
- **Problem:** utan `PUBLIC_URL` blir `og:url` och `og:image` den adress angriparen anger i Host. Med en cache framför servern kan förhandsvisningar förgiftas att peka på en annan domän (phishing via delningslänkar).
- **Reproduktion:** test `s6-s7-browser-dos.test.mjs` "SEC-21" (`Host: evil.example` ger `http://evil.example/...` i taggarna).
- **Åtgärd:** kräv `PUBLIC_URL` när `NODE_ENV=production` (vägra starta annars, som för `JWT_SECRET`).
- **Ägare:** Backend

### S7 Tillgänglighet, DoS och rate limiting (6)

Fungerar: skrivgränser per användare (allmän 300/15 min, check-in 60/h, foto 20/h m.fl.), 61:a check-in ger 429 (testat), JSON-gräns 50 kB, sökning begränsar offset till 1 000 och tokens till 10, paginering har maxgränser, notis-id max 500.

#### SEC-07 Medel - Import blockerar servern och saknar egen gräns
- **CVSS 3.1:** 6.5 `CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:N/A:H`
- **Var:** `server/src/routes/imports.js:137-162`
- **Problem:** en import på 850 kB (5 000 rader, 10 000 check-ins) körs synkront och blockerade händelseloopen **964-1 079 ms** i mätningarna; under den tiden svarar servern inte någon. Importen omfattas bara av den allmänna gränsen (300 skrivningar/15 min), så ett konto kan blockera servern cirka 5 av 15 minuter och lägga till 3 miljoner rader per kvart. Datum kan varieras för att undgå dubblettkontrollen.
- **Reproduktion:** test `s6-s7-browser-dos.test.mjs` "SEC-07".
- **Åtgärd:** egen gräns (t.ex. 5 importer/dygn och tak på totalt antal check-ins per konto), dela upp insättningen i batchar med `setImmediate` mellan, eller kör i worker thread.
- **Ägare:** Backend

#### SEC-22 Låg - Ingen rate limit på läsande endpoints
- **Var:** `server/src/app.js:231-234` (gränser bara för skrivande metoder)
- **Problem:** 400 sökningar i följd gav aldrig 429. Underlättar skrapning, uppräkning av användare (`GET /api/users?q=` utan söktext listar alla) och automatisering av SEC-01.
- **Reproduktion:** test `s6-s7-browser-dos.test.mjs` "SEC-22".
- **Åtgärd:** generös läsgräns per IP/användare (t.ex. 600/min) och striktare för sök och topplistor.
- **Ägare:** Backend

#### SEC-28 Låg - Proxykonfiguration som lätt blir fel
- **Var:** `server/src/app.js:111`, `server/.env.example`
- **Problem:** `TRUST_PROXY=true` får servern att krascha vid start (`invalid IP address: true`). Utelämnas variabeln bakom en reverse proxy delar alla användare samma IP, och auth-gränsen 100/15 min blir en global gräns som en enda angripare kan förbruka. OPTIONS-anrop till `/api/auth` räknas också mot auth-gränsen.
- **Åtgärd:** tolka `true`/`false`, varna vid start i produktion om `X-Forwarded-For` förekommer utan `TRUST_PROXY`, låt OPTIONS passera gränsen.
- **Ägare:** Backend

### S8 Beroenden, hemligheter och leveranskedja (7)

Fungerar: inga nycklar, lösenord eller `.env`-filer i någon av 59 commits; `server/data/vapid.json` är gitignorerad; `JWT_SECRET` krävs (minst 32 tecken) i produktion; låsfil och `npm ci` i CI; workflow med `permissions: contents: read` och inga hemligheter. Licenser för 140 produktionspaket: MIT, ISC, BSD-3, Apache-2.0 och MPL-2.0 (fil-copyleft, inget hinder för en webbtjänst). Semgrep: 4 träffar för hårdkodade hemligheter, alla ofarliga (dev-nyckel som vägras i produktion, demolösenord, testskript).

#### SEC-24 Medel - Kända sårbarheter i beroenden
- **CVSS 3.1:** ej tillämplig sammantaget (se respektive advisory)
- **Var:** `client/package.json`
- **Problem:** `npm audit` (full): 7 sårbarheter, 2 kritiska (`vitest` 3.2.4 via `tinypool` 1.1.1, prototype pollution till RCE), 1 hög (`vite` 5.4.21 med 8 advisories, bl.a. dev-serverns fil- och förfrågningsläckor), 4 medel. Produktion (`--omit=dev`): `react-router-dom` 6.30.6, medel (open redirect via backslash i `Link`/`useNavigate`; appen skickar inte användarstyrd text dit, men kräver uppgradering). CI kör `npm audit --omit=dev --audit-level=high` och missar därför dev-sårbarheterna helt.
- **Åtgärd:** uppgradera `vitest` till 4.x, `vite` till 6.4.4 eller senare och `react-router-dom` till 7.18 eller senare; kör full audit i CI med `--audit-level=critical` som minimum.
- **Ägare:** Bygg

#### SEC-25 Låg - CI-härdning
- **Var:** `.github/workflows/ci.yml`
- **Problem:** actions pinnas på taggar (`actions/checkout@v4`), inte commit-SHA; ingen Dependabot/Renovate, ingen CodeQL eller hemlighetsskanning; `npx playwright install` hämtar binärer utan versionslås utöver paketet.
- **Åtgärd:** pinna actions på SHA, lägg till `dependabot.yml` för npm och actions, aktivera CodeQL och secret scanning.
- **Ägare:** Bygg

#### SEC-26 Låg - Demoskriptet saknar skydd mot produktion
- **Var:** `server/scripts/seed-demo.js:12`
- **Problem:** körs det mot produktionsdatabasen skapas konton med känt lösenord (`demo1234`) och befintliga konton med namnen `oliver`, `anna`, `mads`, `sarah`, `lena` raderas.
- **Åtgärd:** vägra köra när `NODE_ENV=production` utan uttrycklig flagga.
- **Ägare:** Backend

### S9 Loggning, felhantering och övervakning (6)

Fungerar: en JSON-rad per anrop med request-id, metod, väg **utan query-sträng**, status, tid och användar-id; inga lösenord, tokens eller kommentarer loggas. 500-svar innehåller bara `requestId`, stack trace stannar i serverloggen. Felaktig JSON ger 400, för stor kropp 413. Moderatorbeslut sparas i `moderation_log`.

#### SEC-14 Medel - Säkerhetshändelser loggas inte
- **CVSS 3.1:** ej tillämplig (kontrollbrist, ASVS 7.1-7.2)
- **Var:** `server/src/app.js:61-79`, `server/src/routes/auth.js`, `server/src/sessions.js`
- **Problem:** misslyckade inloggningar, kontospärrar, upptäckt återanvändning av refresh-token (stöld), lösenordsbyte, "logga ut alla", kontoradering och 429 loggas inte som egna händelser, och klientens IP-adress saknas i loggraderna. Brute force, credential stuffing och kapade sessioner går därför inte att upptäcka eller utreda i efterhand, och det finns inget larm.
- **Åtgärd:** logga säkerhetshändelser med typ, användar-id, IP (pseudonymiserad efter en tid) och request-id; larma på återanvänd refresh-token och toppar i 401/429. Dokumentera lagringstid.
- **Ägare:** Backend

(SEC-15 under S1 hör också hit.)

### S10 Användarytans säkerhet och integritet (5)

Fungerar: integritetsval samlade under Inställningar > Integritet med förklarande text; skyddade förval för nya konton (1 h fördröjning, dold hemmaflygplats); synlighetsväljare vid check-in med hänvisning till förvalen; "syns för andra ..." på egna fördröjda check-ins; inloggade enheter listas med OS och webbläsare och kan loggas ut en och en; "logga ut alla" fungerar (testat); radering kräver lösenord; användarnamn begränsade till `[a-z0-9_]`, vilket stoppar homoglyfer i användarnamn.

#### SEC-11 Medel - Offlinekön överlever utloggning och publiceras under nästa konto
- **CVSS 3.1:** 5.3 `CVSS:3.1/AV:L/AC:H/PR:N/UI:R/S:U/C:H/I:L/A:N`
- **Var:** `client/src/lib/auth.jsx:33-46` (utloggning rensar inte utkorgen), `client/src/lib/offlineQueue.js:36-113` (posterna saknar ägare)
- **Problem:** på en delad enhet ligger användare A:s köade check-ins (kommentar, betyg, foton) kvar i IndexedDB efter utloggning och skickas när B loggar in, **som B:s check-ins**. A:s privata innehåll hamnar på B:s konto och B kan läsa det. Under testkörningarna observerades också att en köpost skickades två gånger (check-in 49 och 50), dvs. kön kan ge dubbletter.
- **Reproduktion:** `s10-shared-device.test.mjs` (Playwright mot server med demodata): `anna` köar en check-in offline och loggar ut, `mads` loggar in; check-in med markören skapades med `username: mads`.
- **Åtgärd:** spara användar-id på varje köpost och skicka bara poster som tillhör inloggad användare; vid utloggning fråga "Du har N osända check-ins - radera eller behåll till nästa inloggning som du?" och töm annars kön. Lås flush så att samma post inte skickas två gånger (idempotensnyckel som servern respekterar).
- **Ägare:** Bygg (klient), Backend (idempotensnyckel)

#### SEC-13 Medel - Push-notiser fortsätter efter utloggning
- **CVSS 3.1:** 4.0 `CVSS:3.1/AV:L/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N`
- **Var:** `client/src/lib/auth.jsx:39-46` (anropar inte `disablePush`), `server/src/routes/auth.js:161-174` och `:210-222` (utloggning, "logga ut alla" och lösenordsbyte tar inte bort prenumerationer)
- **Problem:** efter utloggning, även efter "logga ut alla" eller lösenordsbyte efter misstänkt intrång, fortsätter enheten få A:s notiser med namn på personer och flygplatser. På delad enhet ser nästa användare dem; en stulen enhet fortsätter få notiser.
- **Åtgärd:** avregistrera push i klienten vid utloggning; koppla prenumerationer till session (`session_id`) och ta bort dem när sessionen återkallas.
- **Ägare:** Bygg, Backend

#### SEC-29 Låg - Inbjudningslänkar ger direkt tillgång till vänner-innehåll
- **Var:** `server/src/routes/invites.js:214-225`, `client/src/pages/Settings/InviteSection.jsx:51-80`
- **Problem:** en inbjudan ger ömsesidig, godkänd följning utan att mottagaren granskas, 25 användningar och 90 dagar som standard. Delas länken publikt (dela-knappen gör det enkelt) kan vem som helst se vänner-check-ins, och för en privat profil kringgås förfrågningsflödet. Texten nämner följningen men varnar inte för spridning.
- **Åtgärd:** standard 1-5 användningar, varning vid delning, och för privata profiler skapa en följförfrågan som inbjudaren godkänner.
- **Ägare:** Backend, Bygg

#### SEC-30 Låg - Visningsnamn kan imitera andra eller tjänsten
- **Var:** `server/src/routes/auth.js:98`, `:186`
- **Problem:** visningsnamn får vara vilken Unicode-text som helst (40 tecken), t.ex. "Gatelog Support" eller ett annat konto med kyrilliska tecken, och används som rubrik i OG-förhandsvisningar. Phishingrisk vid delade länkar.
- **Åtgärd:** spärra reserverade ord (Gatelog, moderator, support, admin), normalisera förväxlingsbara tecken (Unicode TR39), visa alltid `@användarnamn` bredvid visningsnamnet i delningsbilder.
- **Ägare:** Backend, Grafik

#### SEC-33 Låg - Integritetsförval visas inte vid registrering
- **Var:** `client/src/pages/Auth/RegisterPage.jsx`
- **Problem:** servern skickar valda integritetsinställningar i registreringssvaret "så att klienten kan bekräfta dem", men registreringssidan visar inte vad som gäller (publik profil, publika check-ins efter 1 h). Användaren varnas inte heller före första publiceringen.
- **Åtgärd:** kort sammanfattning med länk till Integritet efter registrering och vid första check-in.
- **Ägare:** Bygg

### S11 Dataskydd och GDPR (5)

Fungerar: export (`GET /api/me/export`, `no-store`), radering med lösenord och kaskad i databasen, filer raderas, notiser och relationer försvinner, användaren kan ändra synlighet i efterhand. Datakällor och licenser redovisas under "Om Gatelog".

#### SEC-19 Medel - Exporten är ofullständig (art. 15 och 20)
- **CVSS 3.1:** ej tillämplig (efterlevnad)
- **Var:** `server/src/routes/account.js:72-96`
- **Problem:** exporten saknar inställningar, sessioner (med enhetsinformation), notiser, givna gillamarkeringar, blockeringar, inskickade rapporter, push-prenumerationer, inbjudningar, importhistorik, märken, utmaningar och XP. Egen hemmaflygplats saknas om den är dold (exporten använder den publika vyn). Foton finns bara som URL:er.
- **Reproduktion:** test `s3-privacy.test.mjs` "SEC-19".
- **Åtgärd:** exportera alla tabeller med användarens id, använd ägarvyn, bifoga foton (zip) och dokumentera formatet.
- **Ägare:** Backend

#### SEC-23 Medel - Integritetspolicy och information saknas
- **CVSS 3.1:** ej tillämplig (efterlevnad, art. 12-14)
- **Var:** klienten saknar sida för integritetspolicy, villkor och kontakt; "Om Gatelog" (`client/src/pages/About/AboutPage.jsx`) innehåller bara datakällor
- **Problem:** användaren får ingen information om personuppgiftsansvarig, ändamål, rättslig grund, lagringstider, mottagare (push-tjänster hos Google/Mozilla/Apple), rättigheter eller hur man klagar. Platsdata (var och när man reser) är integritetskänslig och kräver tydlig information.
- **Åtgärd:** integritetspolicy och kontaktväg länkad från registrering, inställningar och sidfot; rapportera i registerförteckningen.
- **Ägare:** Bygg (sida), ansvarig organisation (innehåll)

#### SEC-27 Medel - Radering lämnar kvar personuppgifter
- **CVSS 3.1:** ej tillämplig (efterlevnad, art. 17)
- **Var:** `server/src/routes/social.js:333-344` (`moderation_log.detail` med innehållskopia), `server/src/db/schema.js` (ingen `secure_delete`), `sessions`-tabellen
- **Problem:** raderat innehåll som modererats ligger kvar som kopia i `moderation_log` utan gallring; rapporter om en raderad användare finns kvar; SQLite skriver inte över raderade sidor (`PRAGMA secure_delete` av) så data finns kvar i databasfil och WAL tills `VACUUM`; återkallade och utgångna sessioner med user agent rensas aldrig. Backuprutiner är okända.
- **Åtgärd:** gallringsjobb (sessioner efter utgång, moderationslogg efter fastställd tid), `PRAGMA secure_delete = ON` eller periodisk `VACUUM`, pseudonymisera rapporter efter radering, dokumentera backupens gallring.
- **Ägare:** Backend

## Prioriterad åtgärdslista per ägare

Gäller alla områden med betyg 7 eller lägre (S1, S3, S4, S5, S7, S8, S9, S10, S11) samt övriga fynd. Ordning: först det som blockerar lansering. När ett fynd är åtgärdat: ta bort `todo` i motsvarande test så att det blir ett regressionstest.

### Backend

1. **SEC-01** (S3, Hög) - topplistor bara på publika, publicerade check-ins; separat publik statistik.
2. **SEC-02** (S3, Hög) - vänförslag på synliga check-ins, inga privata profiler, inga antal.
3. **SEC-04** (S3, Medel) - profilstatistik, XP/nivå, märken, utmaningar, användarsök och OG på synliga check-ins; dölj för `canView=false`; visa `publishAt`.
4. **SEC-03** (S1, Medel) - moderatorroll i databasen knuten till id; spärra reserverade och nyss raderade användarnamn.
5. **SEC-06** (S4, Medel) - vitlista push-tjänster, blockera privata adresser.
6. **SEC-07** (S7, Medel) - egen importgräns, batchad eller asynkron import.
7. **SEC-13** (S10, Medel) - ta bort push-prenumerationer när sessionen återkallas.
8. **SEC-11** (S10, Medel) - idempotensnyckel för check-ins så att köade poster inte dubbleras.
9. **SEC-08** (S5, Medel) - klipp efter EOI eller koda om bilder.
10. **SEC-16** (S1, Medel) - ersätt total kontospärr med fördröjning/CAPTCHA och känd enhet.
11. **SEC-14** (S9, Medel) - logga säkerhetshändelser med IP och larma.
12. **SEC-19, SEC-27** (S11, Medel) - komplett export; gallring, `secure_delete`, pseudonymisering.
13. **SEC-17, SEC-18** (S2, Låg) - synlighetskontroll i avgilla och rapport; skydda push-endpoint.
14. **SEC-05, SEC-09** (S3/S5, Låg) - inga publika cachar för tittarberoende svar och privata foton.
15. **SEC-21, SEC-28** (S6/S7, Låg) - kräv `PUBLIC_URL`, robust `TRUST_PROXY`.
16. **SEC-12, SEC-15, SEC-20, SEC-22, SEC-26, SEC-29, SEC-30** (Låg) - lösenordslista, cookie-parsning, importrensning, läsgränser, skydd i demoskript, inbjudningar, reserverade visningsnamn.
17. **SEC-10** (S6, Låg) - HSTS ett år med preload, smalare `img-src`.

### Bygg (klient och CI)

1. **SEC-11** (S10, Medel) - ägare per köpost, fråga och töm vid utloggning, lås flush.
2. **SEC-13** (S10, Medel) - `disablePush()` vid utloggning och vid 401 `session_revoked`.
3. **SEC-24** (S8, Medel) - uppgradera vitest, vite, react-router-dom; full `npm audit` i CI.
4. **SEC-23** (S11, Medel) - sida för integritetspolicy och kontakt, länkad från registrering och inställningar.
5. **SEC-33, SEC-29** (S10, Låg) - visa integritetsförval vid registrering; varning vid delning av inbjudningslänk.
6. **SEC-25** (S8, Låg) - SHA-pinnade actions, Dependabot, CodeQL, secret scanning.

### Grafik

1. **SEC-10** (S6, Låg) - ersätt inline-stilar med klasser så att `style-src 'unsafe-inline'` kan tas bort.
2. **SEC-30** (S10, Låg) - visa `@användarnamn` tydligt i delningskort och OG-bilder bredvid visningsnamnet.

## Bilaga: testmiljö och reproduktion

- Node 22.23.4, Express 4.22.3, jsonwebtoken 9.0.3, bcryptjs 2.4.3, multer 2.5.0, web-push 3.6.7, Playwright (förinstallerad Chromium), Pillow 12.3, Semgrep 1.185.0.
- Server för manuella prov: `NODE_ENV=production PORT=8795 DB_PATH=/tmp/claude-0/sec/gatelog.db UPLOAD_DIR=/tmp/claude-0/sec/uploads JWT_SECRET=<64 tecken> VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... MODERATORS=modbob`, därefter `npm run seed:demo -w server` mot samma databas.
- `tests/security/helpers.mjs` startar appen i processen med produktionskonfiguration och tillfällig databas. Funktionstester höjer inloggningsgränserna; tester som rör rate limiting (`limits: true`) använder produktionens gränser. Topplistecachen är avstängd (`RANKING_CACHE_MS=0`) för deterministiska tester; i produktion fördröjer den läckan i SEC-01 med högst 30 s.
- `tests/security/s10-shared-device.test.mjs` kräver en körande server med demodata (`BASE_URL`, `DB_PATH`) och hoppas annars över.
- Testfiler: `s1-auth`, `s2-access`, `s3-privacy`, `s4-s5-input-upload`, `s6-s7-browser-dos`, `s10-shared-device` (`.test.mjs`), testbilder i `fixtures/`. Senaste körning: 53 tester, 31 godkända, 22 `todo` (öppna fynd), 0 fel.
