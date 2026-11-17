import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { Avatar } from '../../components/ui.jsx';
import { SkeletonRows } from '../../components/Skeleton.jsx';
import { RankRow } from '../Leaderboard/RankRow.jsx';

const DAYS = 60;
const sinceText = (iso) =>
  iso ? `Sedan ${new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}` : null;

/** Kortet för stammis nummer ett ("Borgmästare på GOT"). Används även i rubriken. */
export function MayorCard({ iata, mayor }) {
  const name = mayor.user.displayName || mayor.user.username;
  return (
    <div className="regulars__mayor">
      <span className="crown">
        <Avatar user={mayor.user} />
      </span>
      <span className="regulars__mayor-text">
        <span className="regulars__mayor-title">Borgmästare på {iata}</span>
        <Link to={`/u/${mayor.user.username}`} className="regulars__mayor-name">
          {name}
        </Link>
        <span className="regulars__mayor-meta">
          {mayor.checkins} check-ins senaste {DAYS} dagarna
        </span>
      </span>
      {mayor.since && <span className="mayor-chip">{sinceText(mayor.since)}</span>}
    </div>
  );
}

/** Stammisar: flest publika check-ins på flygplatsen de senaste 60 dagarna. */
export function Regulars({ iata }) {
  const { user } = useAuth();
  const { data, loading } = useAsync(
    () => api.regulars(iata, DAYS),
    [iata],
    () => api.peek.regulars(iata, DAYS)
  );
  if (loading && !data) return <SkeletonRows count={3} />;
  if (!data) return null;
  const others = data.regulars.filter((r) => r.user.username !== data.mayor?.user.username);
  if (!data.mayor && others.length === 0)
    return (
      <p className="muted mt-0">
        Ingen stammis än. Checka in här minst två gånger på {DAYS} dagar för att bli borgmästare på {iata}.
      </p>
    );
  return (
    <div className="regulars">
      {data.mayor && <MayorCard iata={iata} mayor={data.mayor} />}
      {others.length > 0 && (
        <ol className="list card" aria-label={`Stammisar på ${iata}`}>
          {others.map((r) => (
            <RankRow
              key={r.user.username}
              row={{ rank: r.rank, user: r.user, value: r.checkins }}
              unit="st"
              me={user?.username === r.user.username}
            />
          ))}
        </ol>
      )}
    </div>
  );
}
