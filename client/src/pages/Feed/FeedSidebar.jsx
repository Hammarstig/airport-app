import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAsync } from '../../hooks/useAsync.js';
import { LevelBar, StreakChip } from '../../components/Level.jsx';

/** Sidopanel på desktop: egen nivå, streak och snabbstatistik (dold på mobil via CSS). */
export function FeedSidebar({ username }) {
  const { data: p } = useAsync(
    () => api.user(username),
    [username],
    () => api.peek.user(username)
  );
  if (!p) return <aside className="layout-split__aside" aria-hidden="true" />;
  const st = p.stats || {};
  return (
    <aside className="layout-split__aside" aria-label="Din statistik">
      <div className="card">
        <div className="card__body stack">
          <LevelBar info={p.levelInfo} compact />
          <StreakChip streak={p.streak} />
          <div className="stat-row">
            <div className="stat">
              <div className="stat__value">{st.uniqueAirports ?? 0}</div>
              <div className="stat__label">Flygplatser</div>
            </div>
            <div className="stat">
              <div className="stat__value">{st.countries ?? 0}</div>
              <div className="stat__label">Länder</div>
            </div>
            <div className="stat">
              <div className="stat__value">{p.followers ?? 0}</div>
              <div className="stat__label">Följare</div>
            </div>
          </div>
          <div className="row">
            <Link to={`/u/${username}/map`} className="btn btn--ghost btn--sm">
              Min karta
            </Link>
            <Link to="/leaderboard?scope=friends" className="btn btn--ghost btn--sm">
              Topplista vänner
            </Link>
          </div>
        </div>
      </div>
    </aside>
  );
}
