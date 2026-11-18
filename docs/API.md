# Gatelog API (v4.1)

Aktuell referens för alla vägar. Historik och brytande ändringar: [CHANGELOG.md](CHANGELOG.md).
Koden är facit: `server/src/routes/*.js`. Testerna i `server/test/` täcker varje väg.

## Grunder
- Alla vägar ligger under `/api`. JSON in och ut (utom foton, `card.svg` och export).
- Endast flygplatser med IATA-kod (tre versaler) finns. Små bokstäver accepteras i in-data och vägar.
- **Auth:** `Authorization: Bearer <access-token>`. Se [Sessioner](#sessioner).
- **Fel:** HTTP-status + `{ "error": "meddelande", ...extra }`.

| Status | Betydelse |
|---|---|
| 400 | Validering. Okänt värde på uppräknad parameter ger även `allowed: [...]`. |
| 401 | Inte inloggad. `code`: `token_expired` (förnya med `/auth/refresh`), `session_revoked` eller `invalid_token`. |
| 403 | Saknar behörighet (inte ägare, inte moderator, blockerad, fel lösenord vid kontoradering eller lösenordsbyte). Privat profil: `code: "private_profile"`. |
| 404 | Finns inte, eller får inte ses (dolda check-ins ger 404). |
| 409 | Konflikt (användarnamn upptaget eller i karenstid, lounge finns, max antal foton, push-endpoint hos annat konto `push_endpoint_taken`). |
| 413 | För stor förfrågan (JSON > 50 kB, foto > 5 MB). |
| 429 | Rate limit, med `Retry-After`. |
| 500 | Internt fel, med `requestId`. |

- **Paginering:** `limit` och `offset` där det anges; för stora värden kapas till max.
- **Cache:** API-svar har `Cache-Control: private, no-cache` och svag ETag (304 vid oförändrat). Undantag: kartor `private, max-age=30`, `nearby` `private, max-age=60`, `airlines` och `push/public-key` `public, max-age=3600`, `attributions` `public, max-age=86400`, statistikkort `public, max-age=300` för utloggade och `private, no-cache` för inloggade, export `no-store`. Svar över 1 kB gzip-komprimeras.
- **Headers:** `X-Request-Id` på alla svar (en skickad giltig `X-Request-Id`, 1-64 tecken `[A-Za-z0-9_.-]`, återanvänds). Strikt CSP utan `unsafe-inline` (även stilar), `nosniff`, `X-Frame-Options: DENY`, HSTS ett år i produktion.
- **Rate limit:** `/api/auth/*` 100 anrop per 15 min och IP. Skrivande anrop per användare (eller IP): totalt 300 per 15 min; check-ins 60/h, foton 20/h, kommentarer 60/h, följningar 100/h, gilla 300/h, loungerecensioner 30/h, importer 5/dygn (förhandsvisning 30/h). Läsningar: `/search`, `/users`, `/rankings/*`, `/leaderboard` 300 per 5 min. OPTIONS räknas inte. Bakom proxy krävs `TRUST_PROXY`.

## Objekt
```jsonc
// UserSummary (homeIata är null för andra om användaren döljer sin hemmaflygplats)
{ "username": "oliver", "displayName": "Oliver", "homeIata": "GOT" | null, "level": 7 }

// AirportSummary
{ "iata": "GOT", "icao": "ESGG", "name": "Göteborg Landvetter Airport", "city": "Göteborg", "country": "SE",
  "continent": "EU", "lat": 57.66, "lon": 12.28, "type": "large" | "medium" | "small",
  "region": "SE-Q", "regionName": "Västra Götalands län" }

// Ratings (delbetyg, heltal 1-5 eller null)
{ "security": 4, "cleanliness": 5, "food": 3, "wifi": 4, "transfer": null, "lounges": 4 }

// Checkin
{ "id": 12, "user": UserSummary, "airport": AirportSummary,
  "visitedOn": "2026-11-01", "kind": "departure" | "arrival" | "transfer" | "layover",
  "rating": 4.5 | null,                        // 0,5-5 i steg om 0,5
  "ratings": Ratings, "comment": "text" | null,  // max 1000 tecken
  "likes": 3, "likedByMe": false, "commentCount": 2,
  "airline": { "iata": "SK", "name": "..." } | null,
  "travelClass": "economy" | "premium_economy" | "business" | "first" | null,
  "lounge": { "id": 4, "name": "SAS Lounge", "terminal": null } | null,
  "flightNumber": "SK1421" | null, "photos": Photo[],
  "visibility": "public" | "friends" | "private", "publishAt": "ISO", "source": "app" | "import",
  "createdAt": "ISO", "editedAt": "ISO" | null }

// Photo
{ "id": 1, "url": "/uploads/<32 hex>.jpg", "width": 1600 | null, "height": 1200 | null, "createdAt": "ISO" }

// Lounge
{ "id": 4, "iata": "GOT", "name": "SAS Lounge", "terminal": null, "avgRating": 4.25 | null, "reviewCount": 2 }

// LoungeReview
{ "id": 9, "loungeId": 4, "user": UserSummary, "rating": 4.5, "comment": "..." | null, "visitedOn": "2026-10-01", "createdAt": "ISO" }

// Level
{ "level": 7, "title": "Pendlare", "xp": 1540, "levelXp": 1050, "nextLevelXp": 1400 }

// Streak (ISO-veckor i rad med minst en check-in, Europe/Stockholm)
{ "current": 3, "longest": 8, "thisWeek": true }
```

## Synlighet och integritet
- Varje check-in har `visibility`: `public` (alla om profilen är publik, annars godkända följare), `friends` (godkända följare) eller `private` (bara ägaren). Standard är användarens `defaultVisibility`.
- Före `publishAt` (skapad + `publishDelayHours`) ser bara ägaren check-in:en.
- Blockering döljer check-ins, kommentarer och notiser åt båda håll.
- Reglerna gäller flöden, flygplatsens och användarens check-ins, check-in-detalj, kommentarer, gilla, sök, flygplatsens fotogalleri, `friendsVisited` samt `home_visit`- och `overtaken`-notiser.
- Allt som visar en annan användares resor räknas bara på check-ins som tittaren får se: profilens statistik, XP, nivå (även `level` i UserSummary), märken, svit, månadsutmaningar, flygplatslista, karta, statistikkort, årsöversikt, topplistor, användarsök (`uniqueAirports`) och vänförslag. Ägaren ser allt om sig själv. Lagrade tidpunkter (`completedAt`, `challengesCompleted`) visas bara för ägaren, och märkesnivåer för andra bara så långt synliga check-ins räcker. Flygplatsernas betygssnitt räknas på allt.
- En fördröjd check-in visar `createdAt` = publiceringstiden för andra än ägaren.
- **Privat profil:** följning kräver godkännande. Andra än godkända följare får 403 `private_profile` på `/users/:u/{checkins, airports, map, map/:country, wishlist, badges, followers, following, card, card.svg}`, och profilen visar `stats: null`. Globala topplistor och topplistor per land är samma för alla (anonym vy), så privata profiler syns inte där; följare ser dem med `scope=friends`.

## Sessioner
| Metod | Väg | Body | Svar |
|---|---|---|---|
| POST | /auth/register | `{ username, password, displayName?, homeIata?, privacy?, ref? }` | 201 `{ token, user, expiresIn, settings, invitedBy }` + cookie |
| POST | /auth/login | `{ username, password }` | `{ token, user, expiresIn }` + cookie (401 vid fel) |
| POST | /auth/refresh | - (cookie) | `{ token, user, expiresIn }`, roterar cookien |
| POST | /auth/logout | - | 204, återkallar den egna sessionen (från access-token, eller cookie vars hemlighet verifieras) och rensar cookien |
| POST | /auth/logout-all | - (auth) | 204, återkallar alla sessioner |
| GET | /me/sessions | - | `[{ id, createdAt, lastUsedAt, client, current }]` |
| DELETE | /me/sessions/:id | - | 204 |
| POST | /me/password | `{ currentPassword, newPassword }` | `{ token, expiresIn }`; 403 vid fel nuvarande lösenord; andra sessioner återkallas |

- `user` är UserSummary plus `isModerator`.
- `token` är en access-token (JWT, HS256) som gäller i 15 minuter (`expiresIn: 900`) och bär sessionens id. Sessionen kontrolleras vid varje anrop, så utloggning och lösenordsbyte gäller direkt.
- Cookien `gl_refresh` är `HttpOnly; SameSite=Strict; Path=/api/auth; Max-Age=30 dagar` och `Secure` i produktion. Varje refresh ger en ny cookie. Föregående token godtas i 30 sekunder (flera flikar); därefter återkallar en återanvänd token hela sessionen.
- **Nya konton** får skyddade standardval: `publishDelayHours: 1` och `hideHomeAirport: true`. `privacy: { isPrivate?, defaultVisibility?, publishDelayHours?, hideHomeAirport?, notifyHomeVisits? }` ändrar dem direkt vid registrering; svaret visar resultatet i `settings`. `ref` är en inbjudningskod (se [Inbjudningar](#inbjudningar)); `invitedBy` är den inbjudandes användarnamn eller null.
- **Misslyckade inloggningar:** per konto+IP hård spärr efter 10 fel per 15 min (429 med `Retry-After`, även med rätt lösenord). Per konto ger 50 fel växande fördröjning av svaret (250 ms per fel, max 5 s) i stället för spärr, så att ingen kan låsa ute ägaren; först vid 1 000 fel spärras kontot, utom för en känd enhet (giltig `gl_refresh`). Lyckad inloggning nollställer konto+IP-räknaren.
- Cookien `gl_media` (`HttpOnly; SameSite=Strict; Path=/uploads`, 1 h, förnyas vid inloggning och refresh) ger åtkomst till foton som inte är publika. Utloggning rensar båda cookies.
- `username`: 3-20 tecken `[a-z0-9_]` (gemenas). Reserverade namn (admin, support, moderator, gatelog m.fl.) ger 400; namn från raderade konton är spärrade i 90 dagar (409). `displayName` får inte likna Gatelog eller personalen (400, förväxlingsbara tecken normaliseras). Lösenord: 8-200 tecken, inte lika med användarnamnet, inte ett vanligt lösenord och inte en vanlig stam med siffror, årtal eller tecken (t.ex. `Summer2026`, `football1`).
- Utloggning, "logga ut alla", återkallad session och lösenordsbyte tar bort push-prenumerationer som hör till de återkallade sessionerna.

## Eget konto
| Metod | Väg | Svar |
|---|---|---|
| GET | /me | UserSummary + `isModerator` |
| PATCH | /me | `{ displayName?, homeIata? }` -> som GET |
| GET | /me/settings | Settings |
| PATCH | /me/settings | delvis Settings -> Settings |
| GET | /me/recent-airports?limit=6 | `[{ airport, lastVisit, visits, isHome }]`: hemmaflygplatsen först (även obesökt), sedan senast incheckade |
| GET | /me/export | JSON med all egen data i ägarvyn, `Content-Disposition: attachment`: `user` (med egen hemmaflygplats), `checkins`, `loungeReviews`, `comments`, `wishlist`, `following`, `followers`, `settings`, `stats`, `level`, `badges`, `challenges`, `mayorships`, `likes`, `notifications`, `sessions` (utan hemligheter), `blocks`, `reports`, `pushSubscriptions`, `invites`, `imports`, `photos` (URL), `moderationActions` |
| DELETE | /me | `{ password }` -> 204. 400 utan lösenord, 403 vid fel. Raderar allt utom lounger man skapat; fritext i rapporter om användaren och innehållskopior i modereringsloggen tas bort. Användarnamnet spärras i 90 dagar. |

```jsonc
// Settings
{ "isPrivate": false, "defaultVisibility": "public", "publishDelayHours": 0 | 1 | 24 | 168,
  "hideHomeAirport": false, "notifyHomeVisits": true,
  "push": { "follow": true, "follow_request": true, "follow_accepted": true, "comment": true,
            "like": true, "badge": true, "home_visit": true, "overtaken": true, "invite_accepted": true,
            "mayor_gained": true, "mayor_lost": true, "challenge_completed": true } }
```
Görs profilen publik godkänns väntande följförfrågningar.

## Flygplatser
| Metod | Väg | Svar |
|---|---|---|
| GET | /airports?q=&country=&continent=&type=&minRating=&visited=&sort=&limit=20&offset=0 | `[AirportSummary & { countryName, matchedOn, avgRating, ratingCount, checkins }]` |
| GET | /airports/nearby?lat=&lon=&limit=10&radiusKm=500&scope=scheduled\|all | `[AirportSummary & { countryName, distanceKm }]` närmast först |
| GET | /airports/:iata | AirportSummary & `{ countryName, mayor, stats, lounges: Lounge[], photos: Photo[] (12), onMyWishlist, myVisits, friendsVisited: UserSummary[] (10) }` |
| GET | /airports/:iata/regulars?days=60 | se [Stammisar](#stammisar-borgmästare) |
| GET | /airports/:iata/card.svg | delningskort, se [Delning](#delning-och-open-graph) |
| GET | /airports/:iata/checkins?limit&offset | `Checkin[]` efter `visitedOn`, nyast först |
| GET | /airports/:iata/lounges | `Lounge[]` |
| POST | /airports/:iata/lounges | `{ name, terminal? }` -> 201 Lounge (auth; 409 om namnet finns) |

- **Sök (`q`):** matchar i ordning IATA exakt, ICAO exakt, landskod exakt, stad (prefix och ord-prefix), flygplatsnamn (ord-prefix), land (svenska och engelska namn). Skiftlägesokänsligt och diakritik-tolerant ("goteborg" hittar Göteborg). `matchedOn`: `iata | icao | city | name | country`. Inom nivå: large > medium > small, sedan antal check-ins. Söksträng utan sökbara tecken ger `[]`.
- `type`: `large | medium | small`. `visited`: `any | mine | notmine` (ignoreras utan inloggning). `sort`: `relevance | rating | checkins | name` (standard `relevance` med `q`, annars `checkins`). `sort=rating` använder Bayesianskt snitt.
- `nearby`: `radiusKm` max 2000, `limit` max 50; 400 vid ogiltig position.
- `stats`: `{ visitors, checkins, avgRating, ratingCount, subAverages (Ratings-format med snitt eller null), topAirlines: [{ airline, checkins }] (5), classMix: { economy, premium_economy, business, first } }`.
- `onMyWishlist` och `myVisits` är `false` och `0` utan inloggning.

## Check-ins
| Metod | Väg | Svar |
|---|---|---|
| POST | /checkins | se nedan -> 201 Checkin + belöningar (auth) |
| GET | /checkins/:id | Checkin (404 om dold) |
| PATCH | /checkins/:id | delvis -> Checkin (ägare) |
| DELETE | /checkins/:id | 204 (ägare; foton och kopplad loungerecension raderas) |
| POST | /checkins/:id/like | `{ likes, likedByMe: true }` (auth, idempotent) |
| DELETE | /checkins/:id/like | `{ likes, likedByMe: false }` |
| GET | /feed?scope=global\|friends\|mine&iata=&limit&offset | `Checkin[]` efter `createdAt`, nyast först. `friends` = jag + godkända följningar (auth). Importerade check-ins visas inte. |
| GET | /checkins/:id/card.svg | delningskort (bara publika check-ins) |

**POST /checkins** tar valfri header `Idempotency-Key` (8-64 tecken `[A-Za-z0-9_.:-]`). Samma nyckel från samma användare skapar ingen ny check-in utan svarar 200 med den befintliga och `replayed: true` (offlinekön).

**POST /checkins** body: `{ iata, visitedOn, kind, rating?, ratings?, comment?, visibility?, airlineIata?, travelClass?, flightNumber?, loungeId? | newLounge?: { name, terminal? }, loungeRating?, loungeComment? }`
- `visitedOn` får inte vara i framtiden (senaste av dagens datum i UTC och Europe/Stockholm). `flightNumber` max 8 tecken `[A-Z0-9]`. `loungeId` måste ligga på samma flygplats; `newLounge` återanvänder en befintlig lounge med samma namn. `loungeRating` (1-5, halvsteg) kräver lounge och skapar en LoungeReview (med `loungeComment` eller check-in-kommentaren).
- Svaret är Checkin plus:
```jsonc
{ "newBadges": Badge[], "xpGained": 45, "levelInfo": Level, "levelUp": false,
  "milestones": { "isNewAirport": true, "isNewCountry": false, "isNewContinent": false,
                  "uniqueAirports": 11, "countries": 9, "continents": 3, "worldPct": 0.3, "streak": Streak } }
```
`worldPct` = andel av flygplatserna med reguljärtrafik (4 008) som besökts, en decimal.

**PATCH /checkins/:id**: samma fält som POST utom `iata` (400), `newLounge`, `loungeRating` och `loungeComment`. Bara skickade fält ändras; `null` tömmer valfria fält; `ratings` ersätts helt. Sätter `editedAt`.

## Kommentarer
| Metod | Väg | Svar |
|---|---|---|
| GET | /checkins/:id/comments?limit=50&offset=0 | `Comment[]` äldst först |
| POST | /checkins/:id/comments | `{ body }` (1-500 tecken) -> 201 Comment (auth) |
| PATCH | /comments/:id | `{ body }` -> Comment (författaren) |
| DELETE | /comments/:id | 204 (författaren eller check-in-ägaren) |

`Comment`: `{ id, checkinId, user, body, createdAt, editedAt | null, canDelete }`.

## Foton
| Metod | Väg | Svar |
|---|---|---|
| POST | /checkins/:id/photos | `multipart/form-data`, fält `photo` -> 201 Photo (ägare) |
| DELETE | /photos/:id | 204 (ägare) |
| GET | /uploads/:fil | bilden (`nosniff`, sandbox-CSP). Foton som en utloggad får se: `public, max-age=86400`. Övriga kräver cookien `gl_media` och att tittaren får se check-in:en (annars 404), `private, no-cache`. |

JPEG, PNG eller WEBP enligt magic bytes (annars 400), max 5 MB (413), max 4 per check-in (409). EXIF, XMP, IPTC, GPS och kommentarer tas bort innan lagring; för JPEG även MPF och allt efter bildslutet (andrabilder). Filnamn slumpas.

## Användare, följa och blockera
| Metod | Väg | Svar |
|---|---|---|
| GET | /users?q=&limit=20 | `[UserSummary & { uniqueAirports, followedByMe }]` |
| GET | /users/:u | Profil, se nedan |
| GET | /users/:u/airports?sort=recent\|visits\|rating | `[{ airport, visits, lastVisit, myRating }]` (myRating = senaste totalbetyg) |
| GET | /users/:u/checkins?limit&offset | `Checkin[]` efter `visitedOn` |
| GET | /users/:u/challenges?month= | se [Månadsutmaningar](#månadsutmaningar) |
| GET | /users/:u/mayorships | `[{ airport, checkins, since }]` |
| GET | /users/:u/year/:year | se [Årsöversikt](#årsöversikt) |
| GET | /me/suggestions?limit=10 | se [Vänförslag](#vänförslag) |
| GET | /users/:u/followers?limit=50&offset=0 | `[UserSummary & { followedByMe }]` |
| GET | /users/:u/following | som ovan |
| POST | /users/:u/follow | `{ following, requested, followers }` (auth; 400 för sig själv, 403 vid blockering) |
| DELETE | /users/:u/follow | `{ following: false, requested: false, followers }` (tar även bort egen förfrågan) |
| GET | /me/follow-requests | `[UserSummary & { requestedAt }]` |
| POST | /me/follow-requests/:u | 204 godkänn (notis `follow_accepted`) |
| DELETE | /me/follow-requests/:u | 204 avböj |
| POST | /users/:u/block | 204 (tar bort följningar, förfrågningar och notiser mellan er) |
| DELETE | /users/:u/block | 204 |
| GET | /me/blocks | `[UserSummary & { blockedAt }]` |

**Profil** (`GET /users/:u`): UserSummary & `{ isPrivate, canView, stats: { uniqueAirports, totalCheckins, countries, continents, avgGivenRating, xp } | null, followers, following, followedByMe, followRequested, followsMe, levelInfo: Level, streak: Streak | null }`.

## Önskelista
| Metod | Väg | Svar |
|---|---|---|
| GET | /users/:u/wishlist | `[{ airport, addedAt }]` |
| POST | /wishlist | `{ iata }` -> 201 `{ airport, addedAt }` (idempotent) |
| DELETE | /wishlist/:iata | 204 |

## Notiser och Web Push
| Metod | Väg | Svar |
|---|---|---|
| GET | /notifications?limit=30&offset=0&unread=1 | `{ items: Notification[], unread }` nyast först |
| GET | /notifications/unread-count | `{ unread }` |
| POST | /notifications/read | `{ ids?: number[] }` (utan ids: alla) -> `{ unread }` |
| GET | /push/public-key | `{ enabled, publicKey \| null }` |
| POST | /push/subscriptions | `{ endpoint, keys: { p256dh, auth } }` -> 201 (auth, max 10 per användare). `endpoint` måste vara https på port 443 till en känd push-tjänst (`fcm.googleapis.com`, `updates.push.services.mozilla.com`, `*.notify.windows.com`, `web.push.apple.com`, `*.push.apple.com`, plus `PUSH_EXTRA_HOSTS`), inga IP-adresser (400). Prenumerationen kopplas till sessionen. En endpoint som tillhör ett annat konto med aktiv session ger 409 `push_endpoint_taken`. |
| DELETE | /push/subscriptions | `{ endpoint }` -> 204 |

```jsonc
// Notification
{ "id": 5, "type": "follow" | "follow_request" | "follow_accepted" | "comment" | "like" | "badge" | "home_visit" | "overtaken"
          | "invite_accepted" | "mayor_gained" | "mayor_lost" | "challenge_completed",
  "actor": UserSummary | null, "checkinId": 12 | null, "airport": { "iata", "name" } | null,
  "badge": { "id", "name", "tier" } | null, "badges": [{ "id", "name", "tier" }] | null,
  "groupKey": "badge:checkin:12", "url": "/c/12", "text": "anna gillade din check-in på GOT",
  "read": false, "createdAt": "ISO" }
```
- Ingen notis till sig själv eller mellan blockerade. Gilla, följ och förfrågan skapas högst en gång per person och mål.
- `badge`: en notis per händelse med alla nivåer som nåddes (`badges`; `badge` = första). Text "Du nådde brons i Flygplatssamlare" eller "Du nådde 3 nya märkesnivåer".
- `home_visit`: när någon som följer dig checkar in på din hemmaflygplats, om du har `notifyHomeVisits` på och får se check-in:en (aldrig för fördröjda eller privata).
- `overtaken`: när någon du följer passerar dig i veckans topplista (unika flygplatser, ISO-vecka). Högst en per person och vecka.
- Push skickas efter commit om `push[type]` är på. Payload: `{ title: "Gatelog", body, url, tag (= groupKey), type, notificationId }`. VAPID-nycklar via `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` och `VAPID_SUBJECT` (i utveckling genereras `server/data/vapid.json`; i produktion utan nycklar är push avstängt). Prenumerationer som svarar 404/410, eller fallerar fem gånger, tas bort.

## Märken
`GET /users/:u/badges` -> `Badge[]` (23 st: 18 löpande och 5 säsongsmärken, se [Säsongsmärken](#säsongsmärken)). Nivåer sparas när de nås och tas inte tillbaka.
```jsonc
{ "id": "airports", "name": "Flygplatssamlare", "description": "...", "category": "explorer" | "traveller" | "social",
  "tier": null | "bronze" | "silver" | "gold" | "platinum", "tierLevel": 0,
  "earnedAt": "ISO" | null, "tiers": [{ "tier": "bronze", "target": 5, "earnedAt": "ISO" | null }, ...],
  "progress": { "current": 3, "target": 5 }, "rarity": 12.5 }   // rarity = % av användarna med minst brons
```
| id | Mått | Nivåer |
|---|---|---|
| checkins | check-ins | 1 / 50 / 250 / 1000 |
| airports | unika flygplatser | 5 / 25 / 100 / 250 |
| countries | länder | 3 / 15 / 40 / 80 |
| continents | kontinenter utom Antarktis | 3 / 4 / 5 / 6 |
| nordic | nordiska länder (SE, NO, DK, FI, IS) | 3 / 4 / 5 (tre nivåer) |
| hubs | unika stora flygplatser | 10 / 30 / 75 / 150 |
| alphabet | begynnelsebokstäver i IATA-koder | 8 / 14 / 20 / 26 |
| regions-se | svenska län | 3 / 8 / 14 / 18 |
| airlines | flygbolag | 5 / 15 / 40 / 80 |
| front-cabin | check-ins i business/first | 1 / 10 / 40 / 100 |
| transfer-king | transfer-check-ins | 5 / 20 / 75 / 200 |
| home-turf | check-ins på hemmaflygplatsen | 10 / 30 / 75 / 200 |
| streak | längsta veckostreak | 3 / 8 / 20 / 52 |
| reviewer | check-ins med kommentar | 10 / 40 / 120 / 300 |
| lounge-expert | loungerecensioner | 1 / 10 / 40 / 100 |
| photographer | foton | 1 / 20 / 75 / 250 |
| popular | mottagna gilla | 10 / 50 / 250 / 1000 |
| conversationalist | skrivna kommentarer | 5 / 50 / 200 / 500 |

**XP:** 10 per check-in, +25 per unik flygplats, +50 per land, +100 per kontinent, +5 per check-in med kommentar, +5 per check-in med totalbetyg, +10 per loungerecension, +5 per foto. Nivå L kräver 25·L·(L-1) XP.

## Topplistor
| Metod | Väg | Svar |
|---|---|---|
| GET | /rankings/users?metric=&period=&scope=&country=&limit=50 | se nedan |
| GET | /leaderboard (samma parametrar) | `[{ rank, user, value }]` (äldre form) |
| GET | /rankings/airports?category=&country=&continent=&type=&minRatings=1&limit=50 | `[{ rank, airport, avgRating, score, ratingCount }]` |
| GET | /rankings/lounges?minReviews=1&limit=50 | `[{ rank, lounge, airport, avgRating, score, reviewCount }]` |

- `metric`: `airports | countries | continents | checkins | reviews | xp`. `period`: `week | month | year | all` (kalenderperiod i Europe/Stockholm efter `visitedOn`). `scope`: `global | friends | country` (`friends` kräver inloggning; `country` kräver `country` och räknar bara check-ins i landet). `xp` och `reviews` bara med `period=all` och scope global eller friends (annars 400).
- Svar: `{ metric, period, from | null, to | null, items: [{ rank, user, value, change }], me: { rank, value, change } | null, around: [...] }`. Lika värde ger samma plats. `change` = förra periodens placering minus nuvarande (null om ny eller vid `period=all`). `around` = upp till två över och två under mig.
- Perioder räknas globalt och cachas upp till 30 s (`RANKING_CACHE_MS`); `period=all` är alltid aktuell.
- `category`: `overall | security | cleanliness | food | wifi | transfer | lounges`. Sortering på Bayesianskt snitt `score = (C·m + summa) / (C + n)` där `m` är kategorins snitt över alla betyg och `C = 5` (flygplatser) eller `3` (lounger). `avgRating` är det råa snittet.

## Utforska
| Metod | Väg | Svar |
|---|---|---|
| GET | /countries?continent=&sort=name\|checkins\|rating | `[{ code, name (svenska), continent, airports, checkins, avgRating }]` |
| GET | /countries/:code | `{ code, name, continent, airports, checkins, visitors, avgRating, topAirports: [{ airport, avgRating, ratingCount, checkins }] (10) }` |
| GET | /lounges?q=&iata=&country=&sort=rating\|reviews\|name&limit&offset | `[Lounge & { airport }]` |
| GET | /lounges/:id?limit=20&offset=0 | Lounge & `{ reviews: LoungeReview[] }` (synliga recensioner, nyast först) |
| POST | /lounges/:id/reviews | `{ rating (1-5, halvsteg), comment?, visitedOn }` -> 201 LoungeReview (auth) |
| PATCH | /lounge-reviews/:id | `{ rating?, comment?, visitedOn? }` -> LoungeReview (författaren) |
| DELETE | /lounge-reviews/:id | 204 (författaren) |
| GET | /airlines?q=&limit=10 | `[{ iata, icao, name, country }]` (IATA/ICAO exakt först, sedan namn) |

Ett lands kontinent är den vanligaste bland dess flygplatser.

## Sök i kommentarer och recensioner
`GET /search?q=&iata=&minRating=&airline=&travelClass=&sort=recent|relevance&limit=20&offset=0` (minst en av `q` och `iata`)
- Fulltextsök (SQLite FTS5, diakritik-tolerant prefix per ord, alla ord krävs) i check-in-kommentarer och loungerecensioner som tittaren får se.
- Svar: `[{ type: "checkin" | "lounge_review", id, user, airport, loungeName | null, rating, comment, snippet, snippetParts, visitedOn, createdAt }]`.
- `snippet` är HTML-escapad med träffar i `<mark>`; `snippetParts: [{ text, mark }]` är samma utdrag som segment för rendering utan `innerHTML`.
- Standard är nyast först; `relevance` sorterar på bm25. `offset` max 1000. Söksträng utan sökbara ord ger 400.

## Kartor
| Metod | Väg | Svar |
|---|---|---|
| GET | /users/:u/map?scope=scheduled\|all | `{ totals: { visited, total, pct }, continents: [{ code, name, visited, total, pct }], countries: [{ code, name, continent, visited, total, pct }] }` |
| GET | /users/:u/map/:country?scope= | `{ country: { code, name, visited, total, pct }, regions: [{ code, name, visited, total, pct }], airports: [{ iata, name, city, lat, lon, type, scheduled, region, regionName, visited, visits }] }` |

Täckning räknas mot flygplatser med reguljärtrafik (4 008), `scope=all` mot alla 8 799. `pct` med en decimal. Länder utan flygplatser i scope utelämnas. Besökta flygplatser utanför scope visas i `airports` men räknas inte i `total`.

## Statistikkort
| Metod | Väg | Svar |
|---|---|---|
| GET | /users/:u/card?year=2026 | `{ user, year \| null, checkins, uniqueAirports, newAirports, countries, continents, worldPct, topAirport, topAirline, longestStreak, levelInfo, badges, topCountries: [{ code, name, airports }] (3), firstVisit, lastVisit }` |
| GET | /users/:u/card.svg?year= | `image/svg+xml` 1200x630 (Open Graph) |

## Rapporter och moderering
| Metod | Väg | Svar |
|---|---|---|
| POST | /reports | `{ type: "user" \| "comment" \| "checkin", target: username \| id, reason: "spam" \| "harassment" \| "inappropriate" \| "privacy" \| "other", note? }` -> 201 `{ id, status }` (samma öppna rapport igen ger 200) |
| GET | /moderation/reports?status=open\|resolved\|dismissed&limit&offset | `[{ id, type, target, reason, note, reporter, status, reportCount, createdAt }]` (moderator) |
| POST | /moderation/reports/:id | `{ action: "dismiss" \| "resolve" \| "remove_content" }` -> rapporten (moderator). Avslutar alla öppna rapporter för samma mål; `remove_content` raderar kommentaren eller check-in:en. |

| GET | /moderation/log?limit=50&offset=0 | `[{ id, moderator, reportId, action, targetType, targetId, detail, createdAt }]` (moderator, nyast först) |

Moderatorroll lagras i databasen (`users.role`) och sätts med `npm run moderator -w server -- grant|revoke <användarnamn>` eller `list`; env `MODERATORS` används inte längre. Varje åtgärd skrivs till revisionsloggen (vem, vad, när, vilket mål). Rapport av en kommentar eller check-in man inte får se ger 404, precis som en som inte finns.

## Övrigt
| Metod | Väg | Svar |
|---|---|---|
| GET | /health | `{ ok: true, airports: 8799 }` |
| GET | /attributions | `[{ name, url, license, licenseUrl, usage }]` (även `server/data/ATTRIBUTION.md`) |

## Inbjudningar
| Metod | Väg | Svar |
|---|---|---|
| POST | /me/invites | `{ maxUses? (1-100, standard 5) }` -> 201 Invite (max 10 aktiva, 409 annars) |
| GET | /me/invites | `Invite[]` (aktiva) |
| DELETE | /me/invites/:code | 204 |
| GET | /invites/:code | `{ code, inviter: UserSummary, expiresAt }` (publik förhandsvisning, 404 om ogiltig) |

`Invite`: `{ code (10 tecken A-Z/2-9), url: "/register?ref=<code>", uses, maxUses, createdAt, expiresAt (90 dagar) }`. Registrering med giltig `ref` ger ömsesidig följning och notis `invite_accepted` till den som bjöd in; har den inbjudande privat profil blir den nyas följning en följförfrågan (notis `follow_request`). Ogiltig kod ignoreras.

## Vänförslag
`GET /me/suggestions?limit=10` -> `[UserSummary & { reason: "friends" | "airports" | "popular", mutualFriends, sharedAirports }]`
Poäng: personer som dina godkända följningar följer (vänners vänner) och personer med flest gemensamma flygplatser; fyll på med populära profiler. Aldrig dig själv, redan följda/förfrågade eller blockerade.

## Stammisar ("Borgmästare")
- `GET /airports/:iata/regulars?days=60` -> `{ days, mayor: { user, checkins, since } | null, regulars: [{ rank, user, checkins, lastVisit }] (10) }`. `days` 7-365.
- Räknas på check-ins som är synliga för alla (publik profil, `public`, publicerade) med `visitedOn` inom perioden. Stammis nummer ett (`mayor`, 60 dagar) kräver minst 2 check-ins; vid lika behåller nuvarande titeln.
- `GET /airports/:iata` får `mayor: { user, checkins, since } | null`. `GET /users/:u/mayorships` -> `[{ airport, checkins, since }]`.
- Notiser: `mayor_gained` (till den nya) och `mayor_lost` (till den förra, `actor` = den nya).

## Säsongsmärken
Fem nya märken i `GET /users/:u/badges` med `category: "seasonal"` och fältet `season: { from: "MM-DD" | "YYYY-MM-DD", to }`:
`jul` Julresenär (12-20 - 01-06, 1/3/6) · `nyar` Nyårsflygare (12-31 - 01-01, 1/2/3) · `sportlov` Sportlovsresenär (02-10 - 03-10, 1/3/6) · `midsommar` Midsommarflygare (06-19 - 06-26, 1/2/4) · `vinter-2026` Vinterresenär 2026/27 (2026-12-01 - 2027-02-28, 1/5/10).
Måttet är antal check-ins med `visitedOn` i fönstret (återkommande fönster räknas alla år).

## Månadsutmaningar
`GET /users/:u/challenges?month=YYYY-MM` (standard innevarande månad, Europe/Stockholm) ->
`{ month, challenges: [{ id, name, description, progress: { current, target }, completed, completedAt | null }] }`
Utmaningar varje månad: `new-airports` (3 nya flygplatser), `countries` (2 länder), `reviewer` (3 check-ins med kommentar), `rater` (5 check-ins med betyg). Räknas på `visitedOn` i månaden (nya flygplatser = första besöket någonsin i månaden). När en utmaning klaras skapas notisen `challenge_completed` (en gång per utmaning och månad).

## Import av resehistorik
| Metod | Väg | Svar |
|---|---|---|
| POST | /me/imports?dryRun=1 | CSV som `text/csv` (max 1 MB) eller JSON `{ csv }` -> 201 ImportResult (200 vid dryRun) |
| GET | /me/imports | `[{ id, format, rows, imported, createdAt }]` |
| DELETE | /me/imports/:id | 204, raderar check-ins från den importen |

`ImportResult`: `{ id | null, format, rows, imported, duplicates, skipped: [{ line, reason }], preview: [{ line, iata, visitedOn, kind, airlineIata, flightNumber }] (max 50) }`

**CSV-format** (första raden är rubriker, skiftlägesokänsliga; avgränsare `,` `;` eller tab; citattecken enligt RFC 4180; max 5 000 rader, annars 400):
- Datum (krävs): `date`, `visitedOn`, `flight date`, `departure date`, `dep date`, `start date`. Format `YYYY-MM-DD`, `YYYY/MM/DD` eller ISO-tid (datumdelen används). Inte i framtiden.
- Antingen en flygplats: `iata`, `airport`, `airport code` (+ valfri `kind`: departure/arrival/transfer/layover, standard departure),
- eller en flygning: `from`, `origin`, `departure airport`, `dep airport`, `from airport` och `to`, `destination`, `arrival airport`, `arr airport`, `to airport`. Ger en `departure`-check-in på avgångsflygplatsen och en `arrival` på ankomstflygplatsen.
- Flygplatskoder: IATA eller ICAO (översätts). Valfritt: `airline`/`carrier` (IATA-kod med två tecken, annars ignoreras), `flight`/`flight number`, `class`/`cabin` (economy, premium economy, business, first), `rating` (0,5-5), `comment`.
- Exempel (Flighty/App in the Air-exporter har dessa kolumner): `Date,From,To,Airline,Flight` / `2025-06-01,GOT,AMS,KL,KL1158`.
- Dubbletter (samma flygplats, datum och typ som redan finns eller förekommer tidigare i filen) hoppas över. Importerade check-ins får `source: "import"`, användarens standardsynlighet, visas inte i flöden och ger inga notiser till andra; märken uppdateras med en samlad notis.
- Checkin-objektet får fältet `source: "app" | "import"`.

## Delning och Open Graph
- `GET /api/airports/:iata/card.svg` och `GET /api/checkins/:id/card.svg` (1200x630, samma synlighet som för en utloggad besökare; dold check-in ger 404).
- När servern levererar klientens `index.html` för `/c/:id`, `/u/:username` och `/airport/:iata` fylls `<head>` med `<title>`, `og:title`, `og:description`, `og:image` (absolut URL till motsvarande `card.svg`), `og:url`, `og:type` och `twitter:card`. Privat eller dold data ger allmänna taggar. Bas-URL från env `PUBLIC_URL` (annars förfrågans värd). Korten är SVG; plattformar som kräver PNG visar då den allmänna bilden.

## Årsöversikt
`GET /users/:u/year/:year` -> statistikkortets fält för året plus
`{ months: [{ month: "2026-01", checkins, newAirports }] (12), newCountries: [{ code, name, firstVisit }], firstCheckin: { airport, visitedOn } | null, lastCheckin, favoriteAirport: { airport, avgRating, checkins } | null, badgesEarned: [{ id, name, tier, earnedAt }], challengesCompleted }`
Räknas på check-ins som tittaren får se (privat profil: 403 som övriga listor).

## Drift
- Miljövariabler: se `server/.env.example` (läses endast i `server/src/config.js`). `JWT_SECRET` (minst 32 tecken) krävs när `NODE_ENV=production`, annars startar inte servern.
- Databas: SQLite (`node:sqlite`, WAL, `secure_delete`), versionerad med `PRAGMA user_version` och numrerade migreringar i `server/src/db/migrations/` (8 st). Check-ins och kommentarer har AUTOINCREMENT, så id återanvänds aldrig. Statistiktabeller hålls i synk av triggers i samma transaktion.
- **Säkerhetslogg:** en JSON-rad per händelse med `log: "security"`, `type`, `userId`, `reqId`, pseudonymiserad `ip` (HMAC med månadsnyckel) och `net` (/24 eller /48). Typer: `login_ok`, `login_fail`, `login_blocked`, `login_delayed`, `register`, `refresh_reuse` (`alert: true`, larma), `logout`, `logout_all`, `session_revoke`, `password_change`, `account_delete`, `moderation`, `moderator_role`, `rate_limited`. Aldrig lösenord, tokens eller cookies. Av med `SECURITY_LOG=0`. Rekommenderad lagringstid 90 dagar hos loggmottagaren; larma även på toppar i 401/429.
- **Gallring:** en sopare (`SWEEP_MS`, standard 1 min) räknar om publik statistik när fördröjda check-ins publiceras och raderar utgångna/återkallade sessioner efter 30 dagar, modereringslogg efter 365 dagar och avslutade rapporter efter 365 dagar (`RETAIN_*`). Säkerhetskopior ska gallras med samma tider.
- **Produktion:** sätt `PUBLIC_URL` (annars blir Open Graph-länkar relativa; Host-headern används aldrig) och `TRUST_PROXY` bakom proxy (varning loggas annars). `npm run seed:demo -w server` vägrar köra i produktion utan `--force-production`.
- Prestanda: `npm run bench -w server` seedar 300 000 check-ins och kontrollerar budgeten (flygplatsautocomplete < 20 ms, recensionssök < 50 ms).
