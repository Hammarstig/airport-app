# Gatelog - ändringslogg för API:t

Aktuell referens: [API.md](API.md). Här står vad som ändrats mellan versionerna, nyast först.
Brytande ändringar är markerade med **Brytande**.

## v4.1 (säkerhetsgranskning)
- **Integritet (SEC-01, 02, 04, 05):** topplistor, vänförslag, användarsök, profilstatistik, XP, nivå (även `level` i UserSummary), märken, svit, utmaningar och årsöversikt räknas bara på check-ins som tittaren får se. **Brytande:** globala topplistor är samma för alla och visar inte privata profiler (använd `scope=friends`); `completedAt` och `challengesCompleted` visas bara för ägaren; fördröjd check-in har `createdAt` = publiceringstid för andra. Statistikkort för inloggade cachas `private`.
- **Moderatorroll (SEC-03):** **Brytande:** env `MODERATORS` ger ingen roll längre; använd `npm run moderator -w server -- grant <namn>`. Reserverade användarnamn (400) och 90 dagars karenstid för raderade namn (409).
- **DoS (SEC-07, 16, 22):** import i tidsskivor med egen gräns (5/dygn); över 5 000 rader ger 400 i stället för 413. Inloggning: växande fördröjning per konto i stället för spärr, känd enhet släpps förbi. Läsgräns för sök och topplistor.
- **Loggning (SEC-14, 15):** säkerhetslogg (`log: "security"`); trasig cookie ger inte längre 500.
- **GDPR (SEC-19, 27):** fullständig export; radering pseudonymiserar rapporter och modereringslogg; `secure_delete` och gallring.
- **Push (SEC-06, 13, 18):** endpoint måste vara en känd push-tjänst (**Brytande** för andra värdar, se `PUSH_EXTRA_HOSTS`); prenumerationer följer sessionen och tas bort vid utloggning; 409 `push_endpoint_taken` vid försök att ta över en annans.
- **Media (SEC-08, 09):** JPEG rensas från MPF och data efter bildslut. Foton som inte är publika kräver cookien `gl_media` och ger annars 404.
- **Övrigt:** `Idempotency-Key` på `POST /checkins` (SEC-11), CSP utan `unsafe-inline` och HSTS ett år (SEC-10), lösenordsstammar (SEC-12), existensorakel för avgilla och rapport stängda (SEC-17), import rensar styr- och bidi-tecken (SEC-20), OG utan Host-header (SEC-21), demoskript skyddat (SEC-26), `TRUST_PROXY` true/false (SEC-28), inbjudningar standard 5 och följförfrågan för privata profiler (SEC-29), reserverade visningsnamn (SEC-30). Migrering 7 och 8.

## v4 (runda 4)
- Säkerhet: utloggning återkallar bara den egna sessionen (cookie-hemligheten verifieras; tidigare kunde ett känt sessions-id loggas ut). Misslyckade inloggningar spärras per konto+IP och per konto.
- Integritet som förval: nya konton får 1 h fördröjd publicering och dold hemmaflygplats. `POST /auth/register` tar `privacy` och `ref` och svarar med `settings` och `invitedBy`.
- Inbjudningar (`/me/invites`, `/invites/:code`) med ömsesidig följning och notis `invite_accepted`. Vänförslag (`/me/suggestions`).
- Stammisar per flygplats (`/airports/:iata/regulars`, `mayor` på flygplatssidan, `/users/:u/mayorships`) med notiserna `mayor_gained` och `mayor_lost`.
- Fem säsongsmärken (fältet `season`) och månadsutmaningar (`/users/:u/challenges`, notis `challenge_completed`).
- Import av resehistorik från CSV (`/me/imports`) med förhandsvisning, dubblettkontroll och ångra. Checkin får `source`; importer visas inte i flöden.
- Open Graph-taggar för delade sidor och delningskort `airports/:iata/card.svg` och `checkins/:id/card.svg`. Årsöversikt `/users/:u/year/:year`.
- Revisionslogg för moderering (`/moderation/log`).
- Check-ins och kommentarer har AUTOINCREMENT (migrering 6), så id återanvänds aldrig (BUG-12).
- Märkeslistan har 23 märken (18 + 5 säsong).

## v3 (runda 3)
- Sessioner: access-token gäller 15 minuter och bär sessions-id; refresh-token i `HttpOnly; SameSite=Strict`-cookie med rotation och återkallelse. Nya vägar: `POST /auth/refresh`, `/auth/logout`, `/auth/logout-all`, `GET/DELETE /me/sessions`, `POST /me/password`. **Brytande:** tokens från v2 (30 dagar, utan sessions-id) godtas inte längre; klienten måste förnya med `/auth/refresh` när den får 401 `token_expired`.
- Lösenordspolicy: inte lika med användarnamnet och inte ett vanligt lösenord.
- **Brytande:** `DELETE /me` med fel lösenord ger 403 i stället för 401.
- Integritet: `GET/PATCH /me/settings` (privat profil, standardsynlighet, fördröjd publicering, dold hemmaflygplats, `home_visit` av/på, push per typ). Check-ins får `visibility` och `publishAt`. Privata profiler ger 403 `private_profile` på listor och döljs i globala topplistor.
- Följförfrågningar för privata profiler: `GET /me/follow-requests`, `POST/DELETE /me/follow-requests/:username`. `POST /users/:u/follow` svarar även `requested`.
- Blockering (`POST/DELETE /users/:u/block`, `GET /me/blocks`), rapporter (`POST /reports`) och moderering (`/moderation/reports`, env `MODERATORS`). `GET /me` får `isModerator`.
- Web Push: `GET /push/public-key`, `POST/DELETE /push/subscriptions`. Notiser skickas som push enligt inställningarna.
- Notiser: nya typer `follow_request`, `follow_accepted`, `overtaken`; märkesnotiser grupperas per händelse (`badges`); alla notiser får `groupKey` och `url`.
- Märken: höjda trösklar, `nordic` har tre nivåer.
- **Brytande:** okända värden för uppräknade frågeparametrar ger 400 `{ error, allowed }` i stället för standardvärde.
- Serverstruktur: databasen i `server/src/db/` med numrerade migreringar (4).

## v2 (runda 2)
- Socialt: följa, vänflöde (`scope=friends`), kommentarer, notiser med oläst-räknare.
- Gamification: märken i nivåer (brons-platina, sparade när de nås), XP och nivå, veckostreaks, `milestones`/`xpGained`/`levelUp` i check-in-svaret. **Brytande:** märkes-id:n ändrades och fältet `icon` togs bort.
- Topplistor: `GET /rankings/users` med period, scope, egen placering, omgivning och förändring. Bayesianskt snitt (`score`) för flygplats- och loungerankning.
- Snabb check-in: `GET /airports/nearby`, `GET /me/recent-airports`, `friendsVisited` på flygplatssidan.
- Redigera: `PATCH /checkins/:id`, `PATCH/DELETE /lounge-reviews/:id`; paginerade loungerecensioner.
- Konto: `DELETE /me`, `GET /me/export`; statistikkort `GET /users/:u/card(.svg)`; `GET /attributions`.
- Sök: `snippetParts`; standardordning nyast först, `sort=relevance` för bm25.
- Säkerhet och drift: `JWT_SECRET` krävs i produktion, rate limit på alla skrivande anrop, EXIF/GPS rensas ur foton, request-id och JSON-loggning, förberäknad statistik via triggers.

## v1.3
- Kartor med täckningsgrad: `GET /users/:u/map` och `/map/:country`. `AirportSummary` fick `region` och `regionName`.
- gzip, ETag och `Cache-Control` för API-svar.

## v1.2
- Flygplatssök på IATA, ICAO, stad, namn och land (svenska/engelska, diakritik-tolerant) med `matchedOn` och `countryName`.
- Flygbolag (`GET /airlines`) och resedetaljer på check-in (bolag, klass, lounge, loungebetyg, flightnummer).
- Foton på check-ins (max 4, magic bytes, slumpade filnamn) och galleri på flygplatssidan.

## v1.1
- Utforska: filter och sortering för flygplatser, länder, kategoritopplistor, loungesök och loungetopplista, användarsök.
- Önskelista och märken (beräknade från data). `newBadges` i check-in-svaret, `scope`/`iata` på flödet.

## v1
- Konton, flygplatser (endast IATA), check-ins med totalbetyg och sex delbetyg, gilla, topplistor, fulltextsök i kommentarer och recensioner, lounger.
