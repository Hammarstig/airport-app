import { useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAsync } from '../../hooks/useAsync.js';
import { sortedCountryOptions } from '../../lib/format.js';
import { AirportRow } from '../../components/Rows.jsx';
import { SkeletonRows } from '../../components/Skeleton.jsx';
import { EmptyState, ErrorState } from '../../components/ui.jsx';
import { IconTrophy } from '../../assets/icons.jsx';

/** Bäst betygsatta flygplatser (viktat snitt från servern), med landsfilter i URL:en. */
export function RatedBoard() {
  const [params, setParams] = useSearchParams();
  const country = params.get('country') || '';
  const q = { limit: 50, country: country || undefined };
  const { data, loading, error, reload } = useAsync(
    () => api.airportRankings(q),
    [country],
    () => api.peek.airportRankings(q)
  );
  const setCountry = (v) => {
    const n = new URLSearchParams(params);
    if (v) n.set('country', v);
    else n.delete('country');
    setParams(n, { replace: true });
  };
  return (
    <div className="stack">
      <div className="field">
        <label className="field__label" htmlFor="country-filter">
          Land
        </label>
        <select id="country-filter" className="select" value={country} onChange={(e) => setCountry(e.target.value)}>
          <option value="">Alla länder</option>
          {sortedCountryOptions().map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <p className="muted text-sm">Sorterat på viktat snitt, så att en flygplats med få betyg inte toppar listan.</p>
      {loading && !data && <SkeletonRows />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && data.length === 0 && <EmptyState icon={IconTrophy} title="Inga betygsatta flygplatser här ännu" />}
      {data && data.length > 0 && (
        <ol className="list" aria-label="Bäst betygsatta flygplatser">
          {data.map((r) => (
            <AirportRow
              key={r.airport.iata}
              rank={r.rank}
              airport={r.airport}
              avgRating={r.avgRating}
              ratingCount={r.ratingCount}
            />
          ))}
        </ol>
      )}
    </div>
  );
}
