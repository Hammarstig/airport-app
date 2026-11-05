import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { signToken, requireAuth } from '../auth.js';
import { h, bad, HttpError, cleanText, normIata, userFrom } from '../util.js';

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
// Används vid misslyckad inloggning mot okänt konto så att svarstiden blir likartad.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 10);

export default function authRoutes({ db, secret }) {
  const r = Router();
  const airportExists = db.prepare('SELECT 1 FROM airports WHERE iata = ?');
  const byUsername = db.prepare('SELECT * FROM users WHERE username = ?');
  const byId = db.prepare('SELECT * FROM users WHERE id = ?');

  function homeIata(v) {
    if (v === undefined || v === null || v === '') return null;
    const iata = normIata(v);
    if (!/^[A-Z]{3}$/.test(iata) || !airportExists.get(iata)) throw bad('homeIata är ingen känd IATA-kod');
    return iata;
  }

  r.post('/auth/register', h(async (req, res) => {
    const b = req.body ?? {};
    const username = typeof b.username === 'string' ? b.username.trim().toLowerCase() : '';
    if (!USERNAME_RE.test(username)) throw bad('username måste vara 3-20 tecken a-z, 0-9 eller _');
    if (typeof b.password !== 'string' || b.password.length < 8) throw bad('password måste vara minst 8 tecken');
    if (b.password.length > 200) throw bad('password är för långt');
    const displayName = cleanText(b.displayName, { field: 'displayName', max: 40 }) ?? username;
    const home = homeIata(b.homeIata);
    if (byUsername.get(username)) throw new HttpError(409, 'Användarnamnet är upptaget');
    const hash = await bcrypt.hash(b.password, 10);
    let info;
    try {
      info = db.prepare(`INSERT INTO users (username, password_hash, display_name, home_iata, created_at)
        VALUES (?, ?, ?, ?, ?)`).run(username, hash, displayName, home, new Date().toISOString());
    } catch (e) {
      if (/UNIQUE/.test(e.message)) throw new HttpError(409, 'Användarnamnet är upptaget');
      throw e;
    }
    const user = byId.get(Number(info.lastInsertRowid));
    res.status(201).json({ token: signToken(secret, user), user: userFrom(user) });
  }));

  r.post('/auth/login', h(async (req, res) => {
    const b = req.body ?? {};
    const username = typeof b.username === 'string' ? b.username.trim().toLowerCase() : '';
    const password = typeof b.password === 'string' ? b.password : '';
    if (!username || !password) throw bad('username och password krävs');
    const user = byUsername.get(username);
    const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
    if (!user || !ok) throw new HttpError(401, 'Fel användarnamn eller lösenord');
    res.json({ token: signToken(secret, user), user: userFrom(user) });
  }));

  r.get('/me', requireAuth, h((req, res) => {
    res.json(userFrom(byId.get(req.user.id)));
  }));

  r.patch('/me', requireAuth, h((req, res) => {
    const b = req.body ?? {};
    const cur = byId.get(req.user.id);
    let displayName = cur.display_name;
    let home = cur.home_iata;
    if (b.displayName !== undefined) {
      displayName = cleanText(b.displayName, { field: 'displayName', max: 40, required: true });
    }
    if (b.homeIata !== undefined) home = homeIata(b.homeIata);
    db.prepare('UPDATE users SET display_name = ?, home_iata = ? WHERE id = ?').run(displayName, home, req.user.id);
    res.json(userFrom(byId.get(req.user.id)));
  }));

  return r;
}
