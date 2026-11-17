// Open Graph: server-renderad <head> för delade sidor och kort (SVG 1200x630) för flygplatser och check-ins.
// All data hämtas som en utloggad besökare skulle se den, så att privata resor aldrig hamnar i en förhandsvisning.
import { escapeHtml, round2 } from './util.js';
import { visibleCheckin } from './visibility.js';
import { countryNameSv } from './db/index.js';

const e = (x) => escapeHtml(String(x ?? ''));
const trunc = (s, n) => (s && s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s ?? '');
const KIND_SV = { departure: 'Avgång', arrival: 'Ankomst', transfer: 'Transfer', layover: 'Mellanlandning' };

const DEFAULT = {
  title: 'Gatelog',
  description: 'Logga, betygsätt och jämför världens flygplatser.',
  image: '/icon-512.png',
  type: 'website',
};

/** Metadata för en klientväg, eller standardvärden. */
export function ogMeta(db, path) {
  let m = null;
  if ((m = /^\/c\/(\d+)\/?$/.exec(path))) return checkinMeta(db, Number(m[1]));
  if ((m = /^\/u\/([a-z0-9_]{3,20})\/?$/i.exec(path))) return userMeta(db, m[1].toLowerCase());
  if ((m = /^\/airport\/([a-z]{3})\/?$/i.exec(path))) return airportMeta(db, m[1].toUpperCase());
  return null;
}

function checkinMeta(db, id) {
  const c = visibleCheckin(db, null, id);
  if (!c) return null;
  const x = db.prepare(`SELECT u.display_name, u.username, a.name, a.iata FROM users u, airports a WHERE u.id = ? AND a.iata = ?`)
    .get(c.user_id, c.iata);
  const rating = c.rating != null ? ` · ${String(c.rating).replace('.', ',')}/5` : '';
  return {
    title: `${x.display_name} på ${x.iata} - Gatelog`,
    description: trunc(`${KIND_SV[c.kind]} ${x.name}${rating}${c.comment ? ` · ${c.comment}` : ''}`, 200),
    image: `/api/checkins/${id}/card.svg`,
    type: 'article',
  };
}

function userMeta(db, username) {
  const u = db.prepare(`SELECT u.*, us.airports, us.countries, us.checkins FROM users u LEFT JOIN user_public_stats us ON us.user_id = u.id
    WHERE u.username = ?`).get(username);
  if (!u) return null;
  if (u.is_private) return { ...DEFAULT, title: `${u.display_name} (@${u.username}) - Gatelog`, type: 'profile' };
  return {
    title: `${u.display_name} (@${u.username}) - Gatelog`,
    description: `${u.airports ?? 0} flygplatser i ${u.countries ?? 0} länder · ${u.checkins ?? 0} check-ins`,
    image: `/api/users/${u.username}/card.svg`,
    type: 'profile',
  };
}

function airportMeta(db, iata) {
  const a = db.prepare(`SELECT a.*, s.checkins, s.rating_sum, s.rating_count FROM airports a
    LEFT JOIN airport_stats s ON s.iata = a.iata WHERE a.iata = ?`).get(iata);
  if (!a) return null;
  const avg = a.rating_count ? ` · snittbetyg ${String(round2(a.rating_sum / a.rating_count)).replace('.', ',')}` : '';
  return {
    title: `${a.name} (${a.iata}) - Gatelog`,
    description: `${a.city ?? ''}${a.city ? ', ' : ''}${countryNameSv(a.country)}${avg} · ${a.checkins ?? 0} check-ins`,
    image: `/api/airports/${a.iata}/card.svg`,
    type: 'website',
  };
}

/** Lägger in titel och meta-taggar i index.html. `base` = publik bas-URL utan avslutande snedstreck. */
export function injectHead(html, meta, base, path) {
  const m = { ...DEFAULT, ...(meta ?? {}) };
  const abs = (u) => (u.startsWith('http') ? u : base + u);
  const tags = [
    ['og:title', m.title], ['og:description', m.description], ['og:image', abs(m.image)], ['og:url', abs(path)],
    ['og:type', m.type], ['og:site_name', 'Gatelog'],
  ].map(([p, v]) => `<meta property="${p}" content="${e(v)}">`);
  tags.push(`<meta name="twitter:card" content="summary_large_image">`, `<meta name="description" content="${e(m.description)}">`);
  const out = /<title>[\s\S]*?<\/title>/.test(html)
    ? html.replace(/<title>[\s\S]*?<\/title>/, `<title>${e(m.title)}</title>`)
    : html.replace('</head>', `<title>${e(m.title)}</title></head>`);
  return out.replace('</head>', `${tags.join('')}</head>`);
}

// ---- Kort (SVG) ----
function svgCard({ kicker, title, subtitle, stats, footer }) {
  const stat = (x, label, value) => `
    <text x="${x}" y="400" font-size="84" font-weight="800" fill="#FFC22E">${e(value)}</text>
    <text x="${x}" y="448" font-size="28" fill="#C9D6EA">${e(label)}</text>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" font-family="Arial Narrow, Arial, sans-serif">
  <rect width="1200" height="630" fill="#08111E"/>
  <rect x="0" y="600" width="1200" height="30" fill="#FFC22E"/>
  <text x="80" y="110" font-size="36" fill="#C9D6EA">${e(kicker)}</text>
  <text x="80" y="200" font-size="64" font-weight="800" fill="#FFFFFF">${e(trunc(title, 34))}</text>
  <text x="80" y="255" font-size="30" fill="#C9D6EA">${e(trunc(subtitle, 70))}</text>
  ${stats.map((s, i) => stat(80 + i * 340, s[0], s[1])).join('')}
  <text x="80" y="550" font-size="28" fill="#FFFFFF">${e(trunc(footer, 80))}</text>
</svg>`;
}

export function airportCardSvg(db, iata) {
  const a = db.prepare(`SELECT a.*, s.checkins, s.visitors, s.rating_sum, s.rating_count FROM airports a
    LEFT JOIN airport_stats s ON s.iata = a.iata WHERE a.iata = ?`).get(iata);
  if (!a) return null;
  const avg = a.rating_count ? String(round2(a.rating_sum / a.rating_count)).replace('.', ',') : '-';
  return svgCard({
    kicker: `Gatelog · ${a.iata}`,
    title: a.name,
    subtitle: `${a.city ?? ''}${a.city ? ', ' : ''}${countryNameSv(a.country)}`,
    stats: [['snittbetyg', avg], ['check-ins', a.checkins ?? 0], ['resenärer', a.visitors ?? 0]],
    footer: a.rating_count ? `${a.rating_count} betyg` : 'Bli först att betygsätta',
  });
}

export function checkinCardSvg(db, id) {
  const c = visibleCheckin(db, null, id);
  if (!c) return null;
  const x = db.prepare(`SELECT u.display_name, u.username, a.name, a.city, a.country FROM users u, airports a
    WHERE u.id = ? AND a.iata = ?`).get(c.user_id, c.iata);
  return svgCard({
    kicker: `Gatelog · ${KIND_SV[c.kind]} ${c.visited_on}`,
    title: `${x.display_name} på ${c.iata}`,
    subtitle: x.name,
    stats: [['betyg', c.rating != null ? String(c.rating).replace('.', ',') : '-'], ['land', countryNameSv(x.country) ?? '-']],
    footer: c.comment ? `"${trunc(c.comment, 70)}"` : `@${x.username}`,
  });
}
