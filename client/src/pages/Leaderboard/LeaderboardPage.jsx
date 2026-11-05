import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { sortedCountryOptions } from '../../lib/format.js';
import { AirportRow } from '../../components/Rows.jsx';
import { Avatar, EmptyState, ErrorState, Spinner, Tabs } from '../../components/ui.jsx';
import { IconTrophy } from '../../assets/icons.jsx';

const TABS = [
  { value: 'airports', label: 'Flygplatser' },
  { value: 'countries', label: 'Länder' },
  { value: 'checkins', label: 'Check-ins' },
  { value: 'rated', label: 'Bäst betygsatta' }
];

const UNIT = { airports: 'flygplatser', countries: 'länder', checkins: 'check-ins' };

function UserBoard({ metric }) {
  const { user } = useAuth();
  const { data, loading, error, reload } = useAsync(() => api.leaderboard(metric, 50), [metric]);
  if (loading) return <Spinner />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data.length) return <EmptyState icon={IconTrophy} title="Topplistan är tom än så länge" />;
  return (
    <ol className="list" aria-label={`Användare efter ${UNIT[metric]}`}>
      {data.map((r) => (
        <li
          key={r.user.username}
          className="list__item"
          aria-current={user && user.username === r.user.username ? 'true' : undefined}
        >
          <span className={`rank${r.rank <= 3 ? ` rank--${r.rank}` : ''}`}>{r.rank}</span>
          <Avatar user={r.user} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Link to={`/u/${r.user.username}`} style={{ fontWeight: 600, display: 'block' }}>
              {r.user.displayName || r.user.username}
            </Link>
            <span className="muted" style={{ fontSize: '0.85em' }}>
              @{r.user.username}
              {r.user.homeIata ? ` · ${r.user.homeIata}` : ''}
            </span>
          </div>
          <span style={{ textAlign: 'right' }}>
            <strong>{r.value}</strong>{' '}
            <span className="muted" style={{ fontSize: '0.85em' }}>
              {UNIT[metric]}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function RatedBoard() {
  const [country, setCountry] = useState('');
  const { data, loading, error, reload } = useAsync(
    () => api.airportRankings({ minRatings: 1, limit: 50, country: country || undefined }),
    [country]
  );
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
      {loading && <Spinner />}
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

export default function LeaderboardPage() {
  useDocumentTitle('Topplistor');
  const [tab, setTab] = useState('airports');
  return (
    <div className="page">
      <header className="page__header">
        <h1 className="page__title">Topplistor</h1>
        <p className="page__subtitle">Vem har besökt flest flygplatser, och vilka flygplatser är bäst?</p>
      </header>
      <Tabs tabs={TABS} value={tab} onChange={setTab} label="Topplistor" />
      <div role="tabpanel" aria-labelledby={`tab-${tab}`} style={{ marginTop: 16 }}>
        {tab === 'rated' ? <RatedBoard /> : <UserBoard metric={tab} />}
      </div>
    </div>
  );
}
