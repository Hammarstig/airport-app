import { api } from '../lib/api.js';
import { useAsync } from '../hooks/useAsync.js';
import { IconCheck, IconComment, IconGlobe, IconPlane, IconStar } from '../assets/icons.jsx';
import { badgeUrl, seasonText } from './Badges.jsx';

const ICON = { 'new-airports': IconPlane, countries: IconGlobe, reviewer: IconComment, rater: IconStar };
const MONTH = new Intl.DateTimeFormat('sv-SE', { month: 'long', timeZone: 'Europe/Stockholm' });

const monthName = (ym) => {
  const s = MONTH.format(new Date(`${ym}-15T12:00:00Z`));
  return s.charAt(0).toUpperCase() + s.slice(1);
};

function daysLeft(ym) {
  const [y, m] = ym.split('-').map(Number);
  const end = new Date(y, m, 1);
  return Math.max(0, Math.ceil((end - Date.now()) / 86400000));
}

function ChallengeCard({ c, month }) {
  const Icon = c.completed ? IconCheck : ICON[c.id] || IconPlane;
  const pct = Math.round(Math.min(1, c.progress.current / Math.max(1, c.progress.target)) * 100);
  const left = daysLeft(month);
  return (
    <li className={`challenge-card${c.completed ? ' challenge-card--done' : ''}`}>
      <span className="challenge-card__media" aria-hidden="true">
        <Icon size={28} />
      </span>
      <div className="challenge-card__head">
        <span className="challenge-card__title">{c.name}</span>
        <span className="challenge-card__when">{monthName(month)}</span>
      </div>
      <div
        className="challenge-card__bar"
        style={{ '--value': pct }}
        role="progressbar"
        aria-label={c.name}
        aria-valuemin={0}
        aria-valuemax={c.progress.target}
        aria-valuenow={Math.min(c.progress.current, c.progress.target)}
      />
      <div className="challenge-card__meta">
        {c.completed ? (
          <>
            <span>Klar</span>
            {c.completedAt && (
              <span>{new Date(c.completedAt).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}</span>
            )}
          </>
        ) : (
          <>
            <span>
              {Math.min(c.progress.current, c.progress.target)} av {c.progress.target}
            </span>
            <span>{left === 1 ? '1 dag kvar' : `${left} dagar kvar`}</span>
          </>
        )}
      </div>
    </li>
  );
}

const DAY = 86400000;
// Fönstret (from/to "MM-DD" återkommande eller "YYYY-MM-DD") som datum runt now: pågående eller nästa.
function seasonWindow(season, now = new Date()) {
  const at = (s, y) => (s.length > 5 ? new Date(`${s}T00:00:00`) : new Date(`${y}-${s}T00:00:00`));
  const y = now.getFullYear();
  for (const year of [y - 1, y, y + 1]) {
    const from = at(season.from, year);
    let to = at(season.to, year);
    if (to < from) to = at(season.to, year + 1);
    to = new Date(to.getTime() + DAY - 1);
    if (to >= now) return { from, to };
    if (season.from.length > 5) return { from, to };
  }
  return null;
}

/** Säsongsmärken som pågår eller börjar inom 30 dagar. */
export function upcomingSeasons(badges, now = new Date()) {
  return (badges || [])
    .filter((b) => b.category === 'seasonal' && b.season)
    .map((b) => ({ b, w: seasonWindow(b.season, now) }))
    .filter(({ w }) => w && w.to >= now && w.from - now < 30 * DAY)
    .sort((a, z) => a.w.from - z.w.from)
    .map(({ b, w }) => ({ ...b, startsIn: w.from > now ? Math.ceil((w.from - now) / DAY) : 0 }));
}

/** Säsongsmärke som pågår eller kommer härnäst, som utmaningskort. */
function SeasonCard({ b }) {
  const url = badgeUrl({ ...b, tier: b.tier || 'bronze' });
  const next = b.progress?.target ?? 1;
  const cur = b.progress?.current ?? 0;
  return (
    <li className="challenge-card challenge-card--season">
      <span className="challenge-card__media" aria-hidden="true">
        {url ? <img src={url} alt="" width={56} height={56} /> : <IconStar size={28} />}
      </span>
      <div className="challenge-card__head">
        <span className="challenge-card__title">{b.name}</span>
        <span className="challenge-card__when">{seasonText(b.season)}</span>
      </div>
      <div
        className="challenge-card__bar"
        style={{ '--value': Math.round(Math.min(1, cur / Math.max(1, next)) * 100) }}
        role="progressbar"
        aria-label={b.name}
        aria-valuemin={0}
        aria-valuemax={next}
        aria-valuenow={Math.min(cur, next)}
      />
      <div className="challenge-card__meta">
        <span>
          {Math.min(cur, next)} av {next}
        </span>
        <span>{b.startsIn ? `Börjar om ${b.startsIn} ${b.startsIn === 1 ? 'dag' : 'dagar'}` : 'Pågår nu'}</span>
      </div>
    </li>
  );
}

/** Månadens utmaningar (och pågående säsongsmärken) för en användare. */
export function Challenges({ username, seasonal = [] }) {
  const { data } = useAsync(
    () => api.challenges(username),
    [username],
    () => api.peek.challenges(username)
  );
  if (!data?.challenges?.length && !seasonal.length) return null;
  const done = data ? data.challenges.filter((c) => c.completed).length : 0;
  return (
    <section className="stack stack--sm" aria-labelledby="ch-title">
      <h2 className="section__title mt-0 mb-0" id="ch-title">
        Utmaningar
        {data && (
          <span className="muted text-sm">
            {' '}
            {done} av {data.challenges.length} klara
          </span>
        )}
      </h2>
      <ul className="stack stack--sm" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {seasonal.map((b) => (
          <SeasonCard key={b.id} b={b} />
        ))}
        {data?.challenges.map((c) => (
          <ChallengeCard key={c.id} c={c} month={data.month} />
        ))}
      </ul>
    </section>
  );
}
