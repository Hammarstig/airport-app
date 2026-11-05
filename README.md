# Gatelog

"Untappd för flygplatser". Logga besök på flygplatser (endast flygplatser med IATA-kod), betygsätt dem och deras lounger, samla märken och nivåer, följ vänner, kommentera check-ins och tävla på topplistor per vecka, månad och år. Appen är en installerbar PWA byggd för Android i första hand och fungerar även offline: check-ins köas på enheten och skickas när nätet är tillbaka.

## Kom igång

Krav: Node.js 22.5 eller senare (servern använder inbyggda `node:sqlite`).

```bash
npm install                  # installerar båda workspaces (server och client)
npm run seed:demo -w server  # valfritt: 4 demoanvändare (lösenord "demo1234") och check-ins
npm run dev                  # server på :8787 och Vite på :5173 med proxy för /api och /uploads
```

Öppna http://localhost:5173. För en produktionslik körning:

```bash
npm run build                # bygger klienten till client/dist
npm start                    # Express serverar API:t och den byggda klienten på :8787
```

## Kommandon

| Kommando | Vad det gör |
|---|---|
| `npm run dev` | Server och klient med omladdning |
| `npm run build` | Bygger klienten (Vite) inklusive service worker och offlinesida |
| `npm start` | Startar servern (serverar även `client/dist`) |
| `npm test` | Serverns tester (node:test) och klientens tester (Vitest + Testing Library) |
| `npm run test:e2e` | Playwright mot byggd app: Android (Pixel 7), desktop och prestanda |
| `npm run test:api` | API-kanttester |
| `npm run lint` | ESLint för hela repot (React, hooks, jsx-a11y) |
| `npm run format` / `format:check` | Prettier för klientkoden |

CI (`.github/workflows/ci.yml`) kör install, lint, formatkontroll, tester, bygge, `npm audit` och Playwright på varje push och pull request.

## Miljövariabler (server)

| Variabel | Standard | Beskrivning |
|---|---|---|
| `PORT` | `8787` | Port för API och klient |
| `JWT_SECRET` | dev-nyckel | Krävs (minst 32 tecken) när `NODE_ENV=production`, annars startar inte servern |
| `DB_PATH` | `server/data/gatelog.db` | SQLite-fil (`:memory:` i tester) |
| `UPLOAD_DIR` | `server/data/uploads` | Uppladdade foton |
| `STATIC_DIR` | `client/dist` | Byggd klient |
| `TRUST_PROXY` | - | Sätt bakom en reverse proxy så att rate limit räknas per klient |
| `CORS_ORIGIN` | - | Tillåten origin om klienten körs på annan domän |

Se `server/src/config.js` för fler (rate limits, loggning).

## Struktur

```
client/                 React 18 + React Router 6 + Vite, ren CSS (inga UI-bibliotek)
  pwa/                  service worker, offlinesida och Vite-plugin som bygger dem
  src/
    pages/<Sida>/       en mapp per sida (Feed, Checkin, Airport, Profile, Map, Leaderboard ...)
    components/         återanvändbara komponenter (CheckinCard, Combobox, StarsInput ...)
    hooks/              useAsync, usePaged, useOnline, useUnread ...
    lib/                api-klient, cache, auth, offlinekö (IndexedDB), bildskalning, format
    styles/, assets/    designsystem, ikoner och märken (se docs/DESIGN.md)
server/                 Node 22, Express, node:sqlite med FTS5, JWT
  src/routes/           en fil per område (checkins, airports, social, rankings ...)
  data/                 flygplatser och flygbolag (JSON), databas och uppladdningar
tests/
  e2e/                  Playwright-sviten
  api/                  API-kanttester
docs/                   API-kontrakt, arkitektur, designsystem, granskning och testrapport
```

Mer i `docs/ARCHITECTURE.md`, `docs/API.md` (API-kontraktet) och `docs/DESIGN.md` (klasser och ikoner).

## Datakällor och licenser

| Källa | Används till | Licens |
|---|---|---|
| [OurAirports](https://ourairports.com/data/) | Flygplatser, IATA/ICAO-koder, koordinater, regioner | Public domain |
| [OpenFlights](https://openflights.org/data.php) | Flygbolag (namn, IATA/ICAO) | [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/) |
| [Natural Earth](https://www.naturalearthdata.com/) via [world-atlas](https://github.com/topojson/world-atlas) | Landsgränser i kartvyn | Public domain / ISC |
| Typsnitt via [@fontsource](https://fontsource.org/) | Atkinson Hyperlegible, Big Shoulders Display, IBM Plex Mono | SIL Open Font License 1.1 |

Flygbolagsdata från OpenFlights används under ODbL; bearbetningar av databasen delas under samma licens. Attributionen visas även i appen under Inställningar > Om Gatelog (`/about`).
