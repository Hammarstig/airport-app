// Ger eller tar bort moderatorroll (users.role) för ett befintligt konto (SEC-03).
// Kör: npm run moderator -w server -- grant <användarnamn> | revoke <användarnamn> | list
import { openDb } from '../src/db/index.js';
import { loadConfig } from '../src/config.js';
import { createSecurityLog } from '../src/seclog.js';

const [cmd, name] = process.argv.slice(2);
const db = openDb(loadConfig().dbPath);
if (cmd === 'list') {
  for (const u of db.prepare("SELECT username FROM users WHERE role = 'moderator' ORDER BY username").all()) console.log(u.username);
} else if (cmd === 'grant' || cmd === 'revoke') {
  const info = db.prepare('UPDATE users SET role = ? WHERE username = ?').run(cmd === 'grant' ? 'moderator' : 'user', String(name ?? '').toLowerCase());
  if (!info.changes) {
    console.error(`Hittar inget konto som heter ${name}`);
    process.exitCode = 1;
  } else {
    const uid = db.prepare('SELECT id FROM users WHERE username = ?').get(String(name).toLowerCase()).id;
    createSecurityLog({ sink: (e) => console.error(JSON.stringify(e)) })(null, 'moderator_role', { userId: uid, role: cmd === 'grant' ? 'moderator' : 'user', via: 'cli' });
    console.log(`${name}: ${cmd === 'grant' ? 'moderator' : 'vanlig användare'}`);
  }
} else {
  console.error('Användning: moderator.js grant|revoke <användarnamn> | list');
  process.exitCode = 1;
}
db.close();
