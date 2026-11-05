# Gatelog API-kontrakt (v1)

Alla anrop under `/api`. JSON in/ut. Auth: `Authorization: Bearer <jwt>`.
Fel: HTTP-status + `{ "error": "meddelande" }`. 400 validering, 401 ej inloggad, 403 ej ägare, 404 saknas, 409 konflikt.
Endast flygplatser med IATA-kod (3 bokstäver, versaler) finns i systemet.

## Gemensamma objekt

```jsonc
// UserSummary
{ "username": "oliver", "displayName": "Oliver", "homeIata": "GOT" | null }

// AirportSummary
{ "iata": "GOT", "icao": "ESGG", "name": "Göteborg Landvetter Airport", "city": "Göteborg",
  "country": "SE", "continent": "EU", "lat": 57.66, "lon": 12.28, "type": "large" }

// Ratings (delbetyg, heltal 1-5 eller null)
{ "security": 4, "cleanliness": 5, "food": 3, "wifi": 4, "transfer": null, "lounges": 4 }

// Checkin (ett besök)
{ "id": 12, "user": UserSummary, "airport": AirportSummary,
  "visitedOn": "2026-11-01",            // YYYY-MM-DD
  "kind": "departure" | "arrival" | "transfer" | "layover",
  "rating": 4.5 | null,                  // totalbetyg 0.5-5 i steg om 0.5
  "ratings": Ratings,
  "comment": "text" | null,              // max 1000 tecken
  "likes": 3, "likedByMe": false, "createdAt": "ISO-8601" }
```

## Auth
| Metod | Väg | Body | Svar |
|---|---|---|---|
| POST | /api/auth/register | `{username, password, displayName?, homeIata?}` | 201 `{token, user}` |
| POST | /api/auth/login | `{username, password}` | `{token, user}` |
| GET | /api/me | - | `UserSummary` (401 utan token) |
| PATCH | /api/me | `{displayName?, homeIata?}` | `UserSummary` |

username: 3-20 tecken `[a-z0-9_]` (gemener). password: minst 8 tecken. 409 om username upptaget.

## Flygplatser
| Metod | Väg | Svar |
|---|---|---|
| GET | /api/airports?q=got&limit=20 | `AirportSummary[]` - matchar IATA exakt först, sedan ICAO/namn/stad (prefix). Stora flygplatser före små. |
| GET | /api/airports/:iata | `AirportSummary & { stats, lounges }` |
| GET | /api/airports/:iata/checkins?limit=20&offset=0 | `Checkin[]` nyast först |
| GET | /api/airports/:iata/lounges | `Lounge[]` |
| POST | /api/airports/:iata/lounges | `{name, terminal?}` -> 201 `Lounge` (auth) |

`stats`: `{ visitors, checkins, avgRating | null, ratingCount, subAverages: { security, cleanliness, food, wifi, transfer, lounges } (null om inga) }`

`Lounge`: `{ id, iata, name, terminal | null, avgRating | null, reviewCount }`

## Lounger
| Metod | Väg | Svar |
|---|---|---|
| GET | /api/lounges/:id | `Lounge & { reviews: LoungeReview[] }` |
| POST | /api/lounges/:id/reviews | `{rating (1-5, steg 0.5), comment?, visitedOn}` -> 201 `LoungeReview` (auth) |

`LoungeReview`: `{ id, loungeId, user: UserSummary, rating, comment, visitedOn, createdAt }`

## Check-ins
| Metod | Väg | Svar |
|---|---|---|
| POST | /api/checkins | `{iata, visitedOn, kind, rating?, ratings?, comment?}` -> 201 `Checkin` (auth). visitedOn får inte vara i framtiden. |
| GET | /api/checkins/:id | `Checkin` |
| DELETE | /api/checkins/:id | 204 (endast ägare) |
| POST | /api/checkins/:id/like | `{likes, likedByMe:true}` (auth) |
| DELETE | /api/checkins/:id/like | `{likes, likedByMe:false}` (auth) |
| GET | /api/feed?limit=20&offset=0 | `Checkin[]` alla användare, nyast först |

## Användare och topplistor
| Metod | Väg | Svar |
|---|---|---|
| GET | /api/users/:username | `UserSummary & { stats: { uniqueAirports, totalCheckins, countries, continents, avgGivenRating } }` |
| GET | /api/users/:username/airports?sort=rating\|visits\|recent | `[{ airport: AirportSummary, visits, lastVisit, myRating }]` - användarens egen lista; myRating = senaste satta totalbetyg |
| GET | /api/users/:username/checkins?limit&offset | `Checkin[]` |
| GET | /api/leaderboard?metric=airports\|countries\|checkins&limit=50 | `[{ rank, user: UserSummary, value }]` |
| GET | /api/rankings/airports?minRatings=1&limit=50&country=SE | `[{ rank, airport, avgRating, ratingCount }]` bäst betygsatta |

## Sök i kommentarer och bedömningar
`GET /api/search?q=lounge&iata=GOT&minRating=4&limit=20&offset=0`

Fulltextsök (SQLite FTS5) över check-in-kommentarer och loungerecensioner. Alla parametrar valfria men minst en av q/iata krävs.
Svar: `[{ type: "checkin" | "lounge_review", id, user, airport, loungeName | null, rating, comment, snippet, visitedOn, createdAt }]`
`snippet` innehåller träffen markerad med `<mark>…</mark>` (övrig text HTML-escapad).

## Health
`GET /api/health` -> `{ ok: true, airports: 8799 }`

---
# v1.1 - Utforska/sök i Untappd-stil

Mappning från Untappd: öl -> flygplats, bryggeri -> land, ölstil -> kategori (kontinent / storlek / delbetyg), venue -> lounge, Top Rated by style -> topplistor per delbetyg.

## Utökad flygplatssökning
`GET /api/airports?q=&country=SE&continent=EU&type=large|medium|small&minRating=4&visited=any|mine|notmine&sort=relevance|rating|checkins|name&limit=20&offset=0`
Svar som tidigare men varje objekt får även `avgRating | null, ratingCount, checkins`. `visited` kräver inloggning (annars ignoreras). Utan `q` returneras listning enligt filter (default sort=checkins).

## Länder ("bryggerier")
| GET | /api/countries?continent=EU | `[{ code: "SE", name: "Sverige", continent, airports, checkins, avgRating | null }]` (landsnamn på svenska via Intl.DisplayNames('sv')) |
| GET | /api/countries/:code | `{ code, name, continent, airports, checkins, visitors, avgRating, topAirports: [{airport, avgRating, ratingCount, checkins}] (10 st) }` |

## Kategoritopplistor ("Top Rated by style")
`GET /api/rankings/airports?category=overall|security|cleanliness|food|wifi|transfer|lounges&country=&continent=&type=&minRatings=1&limit=50`
Lägg till `category` (default overall) - sorterar på respektive delbetygssnitt. Svar `[{ rank, airport, avgRating, ratingCount }]` där avgRating avser vald kategori.

## Lounger
`GET /api/lounges?q=&iata=&country=&sort=rating|reviews|name&limit=20&offset=0` -> `[Lounge & { airport: AirportSummary }]`
`GET /api/rankings/lounges?limit=50&minReviews=1` -> `[{ rank, lounge, airport, avgRating, reviewCount }]`

## Användare
`GET /api/users?q=oli&limit=20` -> `[UserSummary & { uniqueAirports }]`

## Önskelista ("Wishlist")
| GET | /api/users/:username/wishlist | `[{ airport, addedAt }]` |
| POST | /api/wishlist | `{iata}` -> 201 (auth) |
| DELETE | /api/wishlist/:iata | 204 (auth) |
`GET /api/airports/:iata` får även `onMyWishlist: boolean` och `myVisits: number` när inloggad.

## Märken (Badges)
`GET /api/users/:username/badges` -> `[{ id, name, description, icon, earnedAt | null, progress: {current, target} }]`
Märken räknas fram från data (ingen egen tabell krävs): Första check-in, 10/25/50/100 unika flygplatser, 5/15/30 länder, Alla 6 kontinenter (exkl. AN), Transferkung (10 transfer), Loungeexpert (5 loungerecensioner), Hemmaplan (5 besök på hemmaflygplatsen), Recensent (20 check-ins med kommentar), Nordisk resenär (SE, NO, DK, FI, IS).
Check-in-svar (POST /api/checkins) får fältet `newBadges: Badge[]` med märken som låstes upp av just den check-in:en.

## Flöde
`GET /api/feed?scope=global|mine&iata=` - scope mine = egna check-ins (auth).

---
# v1.2 - Sök på allt, resedetaljer och foto

## Flygplatssök matchar stad, namn, land och IATA
`GET /api/airports?q=` ska matcha (skiftlägesokänsligt, diakritik-tolerant så "goteborg" hittar "Göteborg"):
1. IATA exakt (t.ex. "got") - högst
2. ICAO exakt
3. Stad (prefix och ord-prefix, t.ex. "stock" -> ARN, BMA, NYO)
4. Flygplatsnamn (ord-prefix, t.ex. "landvetter", "heathrow")
5. Land - landsnamn på svenska OCH engelska samt landskod ("sverige", "sweden", "se") -> listar landets flygplatser, stora först
Inom samma nivå: large > medium > small, sedan antal check-ins. Varje träff får `matchedOn: "iata"|"icao"|"city"|"name"|"country"` och `countryName` (svenska).
Implementera t.ex. med en normaliserad sökkolumn (gemener, utan diakritik) + FTS5-tabell för flygplatser.

## Flygbolag
Data: `server/data/airlines.json` (986 aktiva bolag med IATA-kod, från OpenFlights, ODbL). Seeda till tabell `airlines`.
`GET /api/airlines?q=sas&limit=10` -> `[{ iata, icao, name, country }]` (matchar IATA-kod exakt först, sedan namn-prefix/ord).

## Check-in får resedetaljer
POST /api/checkins tar även (alla valfria):
- `airlineIata`: "SK" (måste finnas i airlines)
- `travelClass`: "economy" | "premium_economy" | "business" | "first"
- `loungeId`: id för lounge på samma flygplats, ELLER `newLounge: { name, terminal? }` som skapar loungen
- `loungeRating`: 1-5 i steg om 0.5 - skapar samtidigt en LoungeReview (med checkin-kommentaren om ingen separat `loungeComment` anges)
- `flightNumber`: t.ex. "SK1421" (valfri, max 8 tecken, [A-Z0-9])
Checkin-objektet får: `airline: {iata, name} | null, travelClass | null, lounge: {id, name, terminal} | null, flightNumber | null, photos: Photo[]`.
Sök (`/api/search`) får filter `airline=SK`, `travelClass=business`. Flygplatssidans stats får `topAirlines: [{airline, checkins}]` (5 st) och `classMix: {economy, premium_economy, business, first}`.

## Foto ("kort") på check-in
- `POST /api/checkins/:id/photos` (auth, ägare) - `multipart/form-data`, fält `photo` (jpeg/png/webp, max 5 MB, max 4 foton per check-in). Klienten skalar ner till max 1600 px JPEG innan uppladdning. Servern kontrollerar magic bytes, sparar med slumpat filnamn under `server/data/uploads/` (env `UPLOAD_DIR`) och returnerar 201 `Photo`.
- `Photo`: `{ id, url: "/uploads/<fil>", width?, height?, createdAt }`
- `DELETE /api/photos/:id` (ägare) -> 204
- `GET /uploads/<fil>` serveras statiskt med `X-Content-Type-Options: nosniff`.
- Flygplatssidan får `photos: Photo[]` (senaste 12) för ett galleri.

---
# v1.3 - Kartor och täckningsgrad

`server/data/airports.json` har nu även `region` (ISO 3166-2, t.ex. "SE-N") och `regionName` ("Hallands län"). AirportSummary får `region` och `regionName`.

Täckningsgrad räknas mot flygplatser med reguljärtrafik (`scheduled=true`, 4 008 st) som standard; `scope=all` räknar mot alla 8 799.

| GET | /api/users/:username/map?scope=scheduled\|all | `{ totals: {visited, total, pct}, continents: [{code, name, visited, total, pct}], countries: [{code, name, continent, visited, total, pct}] }` - pct med en decimal, länder med total=0 utelämnas |
| GET | /api/users/:username/map/:country?scope= | `{ country: {code, name, visited, total, pct}, regions: [{code, name, visited, total, pct}], airports: [{iata, name, city, lat, lon, type, scheduled, visited, visits}] }` |

Svaren ska vara snabba (< 50 ms med demodata): en aggregerad SQL-fråga per anrop, index på checkins(user_id, iata) och airports(country, region). Sätt `Cache-Control: private, max-age=30`.

# Prestanda- och strukturkrav (gäller hela appen)
- Android först: PWA installerbar i Chrome på Android (manifest med maskable-ikoner 192/512 PNG, service worker som cachar app-skal och statiska filer, offline-sida). Kamera via `<input type="file" accept="image/*" capture="environment">`. iPhone (Safari/PWA) i nästa steg, men bryt inget där.
- Upplevd snabbhet: skeleton-laddning, optimistisk UI för gilla/önskelista, debounce 150 ms på autocomplete med avbrytning (AbortController), kodsplittning per route (React.lazy), kartbiblioteket laddas bara på kartsidan. Mål: initial JS < 200 kB gzip, LCP < 2,5 s på "Moto G Power"-emulering med 4G-throttling, inga layoutskutt.
- API: gzip-komprimering, ETag/Cache-Control för flygplatsdata, inga N+1-frågor.

# Förtydliganden från backend (implementation)
- Fel utöver ovan: 413 för för stor body (JSON > 50 kB eller foto > 5 MB), 429 vid rate limit på `/api/auth` (default 100 anrop/15 min per IP, env `AUTH_RATE_MAX`, `AUTH_RATE_WINDOW_MS`).
- `username` gemenas innan validering vid register/login ("Kalle" blir "kalle").
- `visitedOn` får vara högst dagens datum i UTC eller Europe/Stockholm (det senare av de två).
- `stats.subAverages`: objektet finns alltid, varje fält är `null` om inga delbetyg finns för det.
- Ordning: `/api/feed` efter `createdAt` (nyast först); flygplatsens och användarens check-ins efter `visitedOn` (nyast först).
- `GET /api/airports`: en exakt landskod ("se") rankas direkt efter IATA/ICAO så att landet inte drunknar i stadsprefix (`matchedOn: "country"`). En söksträng utan sökbara tecken ger `[]`.
- `GET /api/airports/:iata`: `onMyWishlist` (false) och `myVisits` (0) finns även utan inloggning.
- `POST /api/wishlist` är idempotent (201 även om flygplatsen redan finns i listan) och svarar `{ airport, addedAt }`. `DELETE /api/wishlist/:iata` ger 204 även om den inte fanns.
- Märken: `icon` är en emoji. `earnedAt` är `visitedOn` (YYYY-MM-DD) för den check-in/recension som nådde målet. Id: `first-checkin`, `airports-10|25|50|100`, `countries-5|15|30`, `all-continents`, `nordic`, `transfer-king`, `home-turf`, `reviewer`, `lounge-expert`.
- `POST /api/checkins` med `newLounge` återanvänder en befintlig lounge med samma namn (skiftlägesokänsligt) på samma flygplats. Loungerecensioner skapade via check-in raderas med check-in:en. Sökfiltren `airline`/`travelClass` matchar loungerecensioner via kopplad check-in.
- Foton: 409 när check-in:en redan har 4 foton, 400 om filen inte är JPEG/PNG/WEBP enligt magic bytes. `width`/`height` läses ur bildhuvudet (kan vara null).
- `GET /api/countries` sorteras på svenskt namn (valfritt `sort=checkins|rating`). Ett lands kontinent är den vanligaste bland dess flygplatser.
- Kartor: `regions[].code` kan vara null (namn "Okänd region"). `airports` i `/map/:country` innehåller även besökta flygplatser utanför scope, men de räknas inte i `total`.
- Caching: API-svar har `Cache-Control: private, no-cache` + ETag (304 vid oförändrat), kartor `private, max-age=30`, `/api/airlines` `public, max-age=3600`. gzip för svar > 1 kB.

# v2 - Socialt, gamification, topplistor

Allt i v1-v1.3 gäller fortfarande om inget annat sägs här. Nya fel: 429 vid rate limit (alla skrivande anrop, se nedan), med `Retry-After`.

## Ändrade gemensamma objekt
```jsonc
// UserSummary får nivå (alla ställen där UserSummary förekommer)
{ "username": "oliver", "displayName": "Oliver", "homeIata": "GOT", "level": 7 }

// Checkin får
{ ..., "commentCount": 2, "editedAt": "ISO-8601" | null }

// Level
{ "level": 7, "title": "Globetrotter", "xp": 1540, "levelXp": 1050, "nextLevelXp": 1400 }
// Nivå L kräver 25*L*(L-1) XP (L1=0, L2=50, L3=150, L4=300 ...). nextLevelXp = gränsen för nästa nivå.
// XP räknas fram ur data: 10/check-in, +25/unik flygplats, +50/land, +100/kontinent,
// +5/check-in med kommentar, +5/check-in med totalbetyg, +10/loungerecension, +5/foto.

// Streak (veckor i rad, ISO-veckor efter visitedOn, Europe/Stockholm)
{ "current": 3, "longest": 8, "thisWeek": true }
// current räknar veckor i följd som slutar denna vecka, eller förra veckan om denna vecka ännu saknar check-in.
```

## Följa
| Metod | Väg | Svar |
|---|---|---|
| POST | /api/users/:username/follow | `{ following: true, followers }` (auth). 400 om man följer sig själv. Idempotent. Skapar notis `follow`. |
| DELETE | /api/users/:username/follow | `{ following: false, followers }` (auth) |
| GET | /api/users/:username/followers?limit=50&offset=0 | `[UserSummary & { followedByMe }]` nyast först |
| GET | /api/users/:username/following?limit=50&offset=0 | `[UserSummary & { followedByMe }]` nyast först |

`GET /api/users/:username` får även: `followers, following, followedByMe, followsMe` (false utan inloggning), `levelInfo: Level`, `streak: Streak`, `stats.xp`.
`GET /api/users?q=` får `followedByMe` per rad.

## Flöde
`GET /api/feed?scope=global|friends|mine&iata=` - `friends` = check-ins från dem jag följer plus mina egna (auth, annars 401).

## Kommentarer på check-ins
| Metod | Väg | Svar |
|---|---|---|
| GET | /api/checkins/:id/comments?limit=50&offset=0 | `Comment[]` äldst först |
| POST | /api/checkins/:id/comments | `{ body }` (1-500 tecken) -> 201 `Comment` (auth). Notis `comment` till check-in-ägaren. |
| PATCH | /api/comments/:id | `{ body }` -> `Comment` (endast författaren) |
| DELETE | /api/comments/:id | 204 (författaren eller check-in-ägaren) |

`Comment`: `{ id, checkinId, user: UserSummary, body, createdAt, editedAt | null, canDelete }` (`canDelete` true för författare och check-in-ägare).

## Gilla ("skål")
Oförändrat (`POST/DELETE /api/checkins/:id/like`). Gilla skapar notis `like` (en per användare och check-in, ingen notis för egna).

## Notiser
| Metod | Väg | Svar |
|---|---|---|
| GET | /api/notifications?limit=30&offset=0&unread=1 | `{ items: Notification[], unread }` nyast först (auth) |
| GET | /api/notifications/unread-count | `{ unread }` (auth, billig att polla) |
| POST | /api/notifications/read | `{ ids?: number[] }` - utan ids markeras alla som lästa -> `{ unread }` (auth) |

`Notification`: `{ id, type, actor: UserSummary | null, checkinId | null, airport: { iata, name } | null, badge: { id, name, tier } | null, text, read, createdAt }`
- `type`: `follow` (någon följer dig), `comment` (kommentar på din check-in), `like` (gillade din check-in), `badge` (du nådde en ny märkesnivå), `home_visit` (någon du har ömsesidig följning med, eller som följer dig, checkade in på din hemmaflygplats).
- `text` är en färdig svensk mening, t.ex. "anna gillade din check-in på GOT". Inga notiser till sig själv.

## Märken med nivåer
`GET /api/users/:username/badges` -> `Badge[]`. Check-in-svarets `newBadges` är `Badge[]` (märken där en ny nivå nåddes, `tier` = den nya nivån).
```jsonc
// Badge
{ "id": "airports", "name": "Flygplatssamlare", "description": "Besök unika flygplatser",
  "category": "explorer" | "traveller" | "social",
  "tier": null | "bronze" | "silver" | "gold" | "platinum", "tierLevel": 0,   // 0 = ej upplåst
  "earnedAt": "ISO-8601" | null,                                           // när senaste nivån nåddes
  "tiers": [{ "tier": "bronze", "target": 10, "earnedAt": "ISO" | null }, ...],
  "progress": { "current": 7, "target": 10 },                              // mot nästa nivå (eller högsta)
  "rarity": 12.5 }                                                         // % av användare med minst brons
```
- Nivåer nås när måttet når målet. `earnedAt` är tidpunkten då servern registrerade nivån (inte besöksdatum). Nivåer tas inte tillbaka om check-ins raderas.
- Fältet `icon` utgår. Grafik: `client/src/assets/badges/<id>.svg`, nivåramen läggs på med klass per `tier`.
- Märken (id: mått, brons/silver/guld/platina):
  `checkins`: check-ins 1/25/100/250 · `airports`: unika flygplatser 10/25/50/100 · `countries`: länder 5/15/30/50 ·
  `continents`: kontinenter exkl. AN 2/3/4/6 · `nordic`: nordiska länder (SE, NO, DK, FI, IS) 2/3/4/5 ·
  `hubs`: unika stora (large) flygplatser 5/15/30/60 · `alphabet`: olika begynnelsebokstäver i besökta IATA-koder 5/10/18/26 ·
  `regions-se`: svenska län 2/4/8/12 · `airlines`: olika flygbolag 3/10/20/40 · `front-cabin`: check-ins i business/first 1/5/15/30 ·
  `transfer-king`: transfer-check-ins 3/10/25/50 · `home-turf`: check-ins på hemmaflygplatsen 5/15/30/60 ·
  `streak`: längsta veckostreak 2/4/8/16 · `reviewer`: check-ins med kommentar 5/20/50/100 ·
  `lounge-expert`: loungerecensioner 1/5/15/30 · `photographer`: foton 1/10/30/75 ·
  `popular`: mottagna gilla 5/25/100/250 · `conversationalist`: skrivna kommentarer 5/25/100/250

## Check-in: svar, redigering
POST /api/checkins svarar som tidigare plus:
```jsonc
{ ..., "newBadges": Badge[], "xpGained": 45, "levelInfo": Level, "levelUp": false,
  "milestones": { "isNewAirport": true, "isNewCountry": false, "isNewContinent": false,
                  "uniqueAirports": 11, "countries": 9, "continents": 3, "worldPct": 0.3, "streak": Streak } }
```
`worldPct` = andel av flygplatserna med reguljärtrafik (4 008) som användaren besökt, en decimal.

`PATCH /api/checkins/:id` (ägare) - samma fält som POST utom `iata`, `newLounge`, `loungeRating` och `loungeComment`. Bara skickade fält ändras; `null` tömmer ett valfritt fält. `ratings` ersätts i sin helhet om det skickas. Svar `Checkin` med `editedAt`.

## Topplistor
`GET /api/rankings/users?metric=airports|countries|continents|checkins|reviews|xp&period=week|month|year|all&scope=global|friends|country&country=SE&limit=50`
```jsonc
{ "metric": "airports", "period": "week", "from": "2026-11-02" | null, "to": "2026-11-08" | null,
  "items": [{ "rank": 1, "user": UserSummary, "value": 12, "change": 2 | null }],
  "me": { "rank": 57, "value": 3, "change": -1 | null } | null,   // null utan inloggning eller om man saknar värde
  "around": [{ rank, user, value, change }] }                       // upp till 2 över och 2 under mig (inkl. mig), tom utan me
```
- Perioder är kalenderperioder i Europe/Stockholm efter `visitedOn` (vecka = ISO-vecka mån-sön). `period=all` ger `from/to = null`.
- `scope=friends` = jag + de jag följer (auth). `scope=country` räknar bara check-ins på flygplatser i `country` ("flest flygplatser i Sverige").
- `metric=xp` och `reviews` stöds bara för `period=all` och `scope=global|friends` (annars 400).
- `change` = placering förra perioden minus placering nu (positivt = klättrat), null om man inte fanns med förra perioden eller vid `period=all`.
- `GET /api/leaderboard` finns kvar (array som tidigare) och tar samma `period`/`scope`/`country`.

## Viktat snitt i rankingar
`GET /api/rankings/airports` och `GET /api/rankings/lounges` sorterar på Bayesianskt snitt `score = (C*m + summa) / (C + n)` där `m` är snittet för kategorin över alla betyg, `C = 5` för flygplatser och `3` för lounger. Raderna får `score` (två decimaler); `avgRating` är fortfarande det råa snittet. `GET /api/airports?sort=rating` använder också `score`.

## Snabb check-in
| Metod | Väg | Svar |
|---|---|---|
| GET | /api/airports/nearby?lat=57.7&lon=11.97&limit=10&radiusKm=500&scope=scheduled\|all | `[AirportSummary & { countryName, distanceKm }]` närmast först. Default bara reguljärtrafik. 400 vid ogiltig lat/lon. |
| GET | /api/me/recent-airports?limit=6 | `[{ airport: AirportSummary, lastVisit, visits, isHome }]` - hemmaflygplatsen först, sedan senast incheckade (auth) |

`GET /api/airports/:iata` får `friendsVisited: UserSummary[]` (max 10, personer jag följer som checkat in där; tom utan inloggning).

## Konto
| Metod | Väg | Svar |
|---|---|---|
| DELETE | /api/me | `{ password }` -> 204. Raderar konto, check-ins, foton (filer), kommentarer, gilla, recensioner, följningar, notiser. Lounger man skapat finns kvar. 401 vid fel lösenord. |
| GET | /api/me/export | JSON med all egen data (`user, checkins, loungeReviews, comments, wishlist, following, followers`) som `Content-Disposition: attachment` |

## Loungerecensioner
`PATCH /api/lounge-reviews/:id` `{ rating?, comment?, visitedOn? }` -> `LoungeReview` (författaren). `DELETE /api/lounge-reviews/:id` -> 204 (författaren).
`GET /api/lounges/:id?limit=20&offset=0` - `reviews` pagineras (default 20, nyast först); `reviewCount` är totalen.

## Sök
`/api/search`-träffar får även `snippetParts: [{ text, mark: boolean }]` så att klienten kan rendera utan `innerHTML`. `snippet` (HTML) finns kvar.

## Statistikkort för delning
| GET | /api/users/:username/card?year=2026 | JSON: `{ user, year | null, checkins, uniqueAirports, newAirports, countries, continents, worldPct, topAirport: {airport, visits} | null, topAirline: {iata, name, checkins} | null, longestStreak, levelInfo, badges (antal upplåsta nivåer), topCountries: [{code, name, airports}] (3 st), firstVisit, lastVisit }`. Utan `year` gäller hela tiden. |
| GET | /api/users/:username/card.svg?year=2026 | `image/svg+xml` 1200x630 (Open Graph-format) med samma siffror |

## Övrigt
- `GET /api/attributions` -> `[{ name, url, license, licenseUrl, usage }]` (OurAirports, OpenFlights, Natural Earth/world-atlas). Samma innehåll i `server/data/ATTRIBUTION.md`.
- Rate limit per användare (inloggad) eller IP på skrivande anrop: totalt 300 per 15 min; check-ins 60/h, foton 20/h, kommentarer 60/h, följningar 100/h. Bakom proxy måste `TRUST_PROXY` sättas.
- Foton: EXIF/XMP/GPS tas bort server-side (JPEG APP1/APP13-segment, PNG eXIf/tEXt/iTXt/zTXt, WEBP EXIF/XMP) innan lagring.
- `JWT_SECRET` krävs (minst 32 tecken) när `NODE_ENV=production`; annars startar inte servern.
