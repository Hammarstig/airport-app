import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAsync } from '../../hooks/useAsync.js';
import { formatDate } from '../../lib/format.js';
import { AirportRow } from '../../components/Rows.jsx';
import { BadgeGrid } from '../../components/Badges.jsx';
import { SkeletonRows } from '../../components/Skeleton.jsx';
import { EmptyState, ErrorState } from '../../components/ui.jsx';
import { IconBadge, IconBookmark } from '../../assets/icons.jsx';

export function BadgesTab({ username }) {
  const { data, loading, error, reload } = useAsync(
    () => api.badges(username),
    [username],
    () => api.peek.badges(username)
  );
  if (loading && !data) return <SkeletonRows count={3} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data.length) return <EmptyState icon={IconBadge} title="Inga märken ännu" />;
  const earned = data.filter((b) => b.earnedAt).length;
  return (
    <div className="stack">
      <p className="muted" style={{ margin: 0 }}>
        {earned} av {data.length} märken upplåsta
      </p>
      <BadgeGrid badges={data} />
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
            Tryck på "Vill besöka" på en flygplatssida. <Link to="/explore">Utforska flygplatser</Link>
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
