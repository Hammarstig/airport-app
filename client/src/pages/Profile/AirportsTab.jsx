import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAsync } from '../../hooks/useAsync.js';
import { formatDate } from '../../lib/format.js';
import { AirportRow } from '../../components/Rows.jsx';
import { SkeletonRows } from '../../components/Skeleton.jsx';
import { EmptyState, ErrorState, Segmented } from '../../components/ui.jsx';
import { IconPlane, IconPlus } from '../../assets/icons.jsx';

const SORTS = [
  { value: 'rating', label: 'Betyg' },
  { value: 'visits', label: 'Besök' },
  { value: 'recent', label: 'Senast' }
];

/** Användarens egen topplista över besökta flygplatser. */
export function AirportsTab({ username, isMe }) {
  const [sort, setSort] = useState('rating');
  const { data, loading, error, reload } = useAsync(
    () => api.userAirports(username, sort),
    [username, sort],
    () => api.peek.userAirports(username, sort)
  );

  return (
    <div className="stack">
      <Segmented options={SORTS} value={sort} onChange={setSort} label="Sortera flygplatser" name="sort" />
      {loading && !data && <SkeletonRows />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && data.length === 0 && (
        <EmptyState icon={IconPlane} title="Inga flygplatser ännu">
          {isMe && (
            <Link to="/checkin" className="btn btn--primary btn--sm">
              <IconPlus size={16} aria-hidden="true" /> Checka in
            </Link>
          )}
        </EmptyState>
      )}
      {data && data.length > 0 && (
        <ol className="list" aria-label={isMe ? 'Min topplista' : 'Flygplatser'}>
          {data.map((row, i) => (
            <AirportRow
              key={row.airport.iata}
              rank={i + 1}
              airport={row.airport}
              avgRating={row.myRating}
              extra={`${row.visits} besök · senast ${formatDate(row.lastVisit)}`}
            />
          ))}
        </ol>
      )}
    </div>
  );
}
