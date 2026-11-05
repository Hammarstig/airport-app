import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAsync } from '../../hooks/useAsync.js';
import { SkeletonRows } from '../../components/Skeleton.jsx';
import { ErrorState, StatRow } from '../../components/ui.jsx';
import { IconMap } from '../../assets/icons.jsx';

/** Profilens kartflik: täckningsgrad i siffror och länk till den stora kartan (laddas bara där). */
export function MapTab({ username }) {
  const { data, loading, error, reload } = useAsync(
    () => api.userMap(username, 'scheduled'),
    [username],
    () => api.peek.userMap(username, 'scheduled')
  );
  if (loading && !data) return <SkeletonRows count={2} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const top = [...data.countries]
    .filter((c) => c.visited)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 5);
  return (
    <div className="stack">
      <Link to={`/u/${username}/map`} className="tile">
        <IconMap size={28} aria-hidden="true" />
        <span className="tile__title">{String(data.totals.pct).replace('.', ',')} % av världen</span>
        <span className="tile__meta">Öppna kartan med länder och regioner</span>
      </Link>
      <StatRow
        label="Täckning"
        items={[
          [data.totals.visited, 'Besökta'],
          [data.countries.filter((c) => c.visited).length, 'Länder'],
          [data.continents.filter((c) => c.visited).length, 'Kontinenter']
        ]}
      />
      {top.length > 0 && (
        <ul className="list">
          {top.map((c) => (
            <li key={c.code} className="list__item">
              <Link to={`/u/${username}/map/${c.code}`} className="flex-1">
                {c.name}
              </Link>
              <span className="muted text-sm">
                {c.visited}/{c.total}
              </span>
              <span className="coverage-bar flex-1" style={{ '--value': Math.min(100, c.pct) }} aria-hidden="true" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
