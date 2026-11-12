# Gatelog - ändringslogg för API:t

Aktuell referens: [API.md](API.md). Här står vad som ändrats mellan versionerna, nyast först.
Brytande ändringar är markerade med **Brytande**.

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
