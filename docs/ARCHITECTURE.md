# Gatelog - arkitektur

"Untappd för flygplatser": logga besök på flygplatser (endast IATA-koder), betygsätt dem och deras lounger, tävla på topplistor och sök i andras kommentarer.

## Stack
- **server/** - Node 22, Express 4, inbyggda `node:sqlite` (ingen native-kompilering), FTS5 för sök, JWT (`jsonwebtoken`) + `bcryptjs`. Port 8787. Databasfil `server/data/gatelog.db` (env `DB_PATH`, `:memory:` i tester). Flygplatser seedas från `server/data/airports.json` (8 799 IATA-flygplatser från OurAirports, public domain).
- **client/** - Vite + React 18 + React Router 6, ren CSS (inga UI-bibliotek). Dev-port 5173 med proxy `/api` -> 8787. I produktion serverar Express `client/dist`.
- **tests/e2e/** - Playwright mot byggd app.

## Ansvar per agent
| Agent | Äger |
|---|---|
| Backend | `server/**` (inkl. `server/test/**` enhetstester) |
| Grafik | `client/src/styles/**`, `client/src/assets/**`, `client/public/**`, `docs/DESIGN.md` |
| Bygg | `client/**` utom grafikens kataloger |
| Test | `tests/**`, `docs/TEST-REPORT.md`; rapporterar fel, rättar inte i andras kod |

## Kommandon (från roten)
- `npm install` - installerar workspaces
- `npm run dev` - server + klient samtidigt
- `npm run build` - bygger klienten
- `npm start` - kör servern som även serverar byggd klient
- `npm test` - serverns tester
- `npm run test:e2e` - Playwright
