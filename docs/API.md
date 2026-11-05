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
