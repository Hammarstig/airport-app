# Driftsättning på Railway

Appen körs som en container (`Dockerfile`) med SQLite på en Railway-volym. Inga externa databaser behövs.

## Första gången

1. **New Project -> Deploy from GitHub repo -> Hammarstig/airport-app.** Railway delar ofta upp monorepot i två tjänster (client/server): behåll en och ta bort den andra. Railways "Config as Code" (`railway.json`) gäller inte nya tjänster, så ställ in manuellt under Settings: Root Directory tom, Builder **Dockerfile**, inget Custom Build/Start Command, inga Watch Paths, Healthcheck Path `/api/health`. Första bygget tar 2-4 minuter.
2. **Lägg till volym:** högerklicka på tjänsten (eller Ctrl/Cmd+K) -> *Add Volume* -> Mount path `/data`, storlek 1 GB räcker länge. Railway sätter då `RAILWAY_VOLUME_MOUNT_PATH=/data` och appen lägger databas, foton och push-nycklar där automatiskt.
3. **Variables** (fliken Variables -> *Raw Editor*, klistra in):
   ```
   JWT_SECRET=${{secret(64)}}
   TRUST_PROXY=1
   VAPID_SUBJECT=mailto:din-adress@example.com
   ```
   `${{secret(64)}}` genereras av Railway och syns aldrig i repot. Push-nycklarna skapas automatiskt på volymen vid första start.
4. **Publik adress:** Settings -> Networking -> *Generate Domain* (port 8080, Railway sätter PORT). Lägg sedan till variabeln `PUBLIC_URL=https://<adressen>` så att delade länkar får rätt förhandsvisning.
5. Vänta tills deployen är grön och öppna adressen. `https://<adressen>/api/health` ska svara `{"ok":true,...}`.

## Efter start

- **Skapa ditt konto** i appen (Registrera).
- **Gör dig till moderator:** tjänstens meny -> *Shell* (eller `railway ssh`) och kör
  `node server/scripts/moderator.js grant <ditt-användarnamn>`
- **Demodata (valfritt, bara för test):** `node server/scripts/seed-demo.js --force-production` i samma shell. Kör inte detta när riktiga användare finns.
- **Installera på Android:** öppna adressen i Chrome -> menyn -> *Installera app*.

## Drift

- **Ny version:** varje push till `main` byggs och driftsätts automatiskt. Databasen uppgraderas vid start.
- **Backup:** Railway tar snapshots av volymen (Volume -> Backups). Slå på schemalagd backup där.
- **Loggar:** fliken Deployments -> View logs. Säkerhetshändelser loggas som JSON med `"type":"security"`.
- **Egen domän:** Settings -> Networking -> *Custom Domain*, lägg in CNAME hos din domänleverantör och uppdatera `PUBLIC_URL`.

## Nuvarande driftsättning

- Adress: https://gatelog-production.up.railway.app
- Railway-projekt: poetic-peace, tjänst `gatelog`, volym `gatelog-volume` på `/data`, region EU West.
