import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAsync } from '../../hooks/useAsync.js';
import { formatDate } from '../../lib/format.js';
import { AirportRow } from '../../components/Rows.jsx';
import { BadgeGrid } from '../../components/Badges.jsx';
import { Challenges, upcomingSeasons } from '../../components/Challenges.jsx';
import { SkeletonRows } from '../../components/Skeleton.jsx';
import { EmptyState, ErrorState } from '../../components/ui.jsx';
import { IconBadge, IconBookmark } from '../../assets/icons.jsx';

function Mayorships({ username }) {
  const { data } = useAsync(
    () => api.mayorships(username),
    [username],
    () => api.peek.mayorships(username)
  );
  if (!data?.length) return null;
  return (
    <section className="stack stack--sm" aria-labelledby="mayor-title">
      <h2 className="section__title mt-0 mb-0" id="mayor-title">
        Borgmästare på
      </h2>
      <ul className="list card">
        {data.map((m) => (
          <li key={m.airport.iata}>
            <Link to={`/airport/${m.airport.iata}`} className="list__item">
              <span className="iata-tag">{m.airport.iata}</span>
              <span className="flex-1 min-w-0">
                <span className="bold block">{m.airport.name}</span>
                <span className="muted text-sm block">{m.checkins} check-ins senaste 60 dagarna</span>
              </span>
              <span className="mayor-chip">
                Sedan {new Date(m.since).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function BadgesTab({ username }) {
  const { data, loading, error, reload } = useAsync(
    () => api.badges(username),
    [username],
    () => api.peek.badges(username)
  );
  if (loading && !data) return <SkeletonRows count={3} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data.length) return <EmptyState icon={IconBadge} title="Inga märken ännu" />;
  const earned = data.filter((b) => b.tierLevel > 0).length;
  const tiers = data.reduce((n, b) => n + (b.tierLevel || 0), 0);
  return (
    <div className="stack stack--lg">
      <Challenges username={username} seasonal={upcomingSeasons(data)} />
      <Mayorships username={username} />
      <section className="stack stack--sm" aria-labelledby="badges-title">
        <h2 className="section__title mt-0 mb-0" id="badges-title">
          Märken
        </h2>
        <p className="muted mt-0 mb-0">
          {earned} av {data.length} märken upplåsta · {tiers} nivåer totalt
        </p>
        <BadgeGrid badges={data} />
      </section>
    </div>
  );
}

export function WishlistTab({ username, isMe }) {
  const { data, loading, error, reload } = useAsync(
    () => api.wishlist(username),
    [username],
    () => api.peek.wishlist(username)
  );
  if (loading && !data) return <SkeletonRows count={3} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data.length) {
    return (
      <EmptyState icon={IconBookmark} title="Önskelistan är tom">
        {isMe && (
          <p className="muted">
            Tryck på ”Vill besöka” på en flygplatssida. <Link to="/explore">Utforska flygplatser</Link>
          </p>
        )}
      </EmptyState>
    );
  }
  return (
    <ul className="list" aria-label="Önskelista">
      {data.map((w) => (
        <AirportRow
          key={w.airport.iata}
          airport={w.airport}
          avgRating={w.airport.avgRating ?? null}
          extra={`tillagd ${formatDate(w.addedAt)}`}
        />
      ))}
    </ul>
  );
}
