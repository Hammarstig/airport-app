import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAsync } from '../../hooks/useAsync.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { CONTINENT_CODES, SUB_RATINGS, continentName, formatRating } from '../../lib/format.js';
import { AirportRow } from '../../components/Rows.jsx';
import { ErrorState, RatingBadge, Spinner } from '../../components/ui.jsx';
import { IconLounge, IconTrophy, IconUser } from '../../assets/icons.jsx';

function CategoryRow({ cat }) {
  const { data, loading, error } = useAsync(
    () => api.airportRankings({ category: cat.key, limit: 3, minRatings: 1 }),
    [cat.key]
  );
  return (
    <div className="card">
      <div className="card__header row items-center">
        <h3 className="mt-0 mb-0">Bäst på {cat.label.toLowerCase()}</h3>
        <span className="spacer" />
        <Link to={`/top/${cat.key}`} className="btn btn--ghost btn--sm" aria-label={`Visa topplistan för ${cat.label}`}>
          Visa alla
        </Link>
      </div>
      <div className="card__body">
        {loading && <Spinner />}
        {error && <p className="muted">{error.message}</p>}
        {data && data.length === 0 && <p className="muted mt-0 mb-0">Inga betyg ännu.</p>}
        {data && data.length > 0 && (
          <ol className="list mt-0 mb-0">
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
    </div>
  );
}

export default function ExplorePage() {
  useDocumentTitle('Utforska');
  const countries = useAsync(() => api.countries(), []);
  const popular = (countries.data || [])
    .filter((c) => c.checkins > 0)
    .sort((a, b) => b.checkins - a.checkins)
    .slice(0, 8);
  const continentStats = {};
  for (const c of countries.data || []) {
    const s = (continentStats[c.continent] ||= { checkins: 0, countries: 0 });
    s.checkins += c.checkins || 0;
    if (c.checkins) s.countries += 1;
  }

  return (
    <div className="page">
      <header className="page__header">
        <h1 className="page__title">Utforska</h1>
        <p className="page__subtitle">Kontinenter, länder, kategorier och topplistor.</p>
      </header>

      <section className="section" aria-labelledby="ex-top">
        <h2 className="section__title" id="ex-top">
          Topplistor
        </h2>
        <div className="grid grid--3">
          <Link to="/leaderboard" className="tile">
            <IconUser size={24} aria-hidden="true" />
            <span className="tile__title">Resenärer</span>
            <span className="tile__meta">Flest flygplatser, länder och check-ins</span>
          </Link>
          <Link to="/top/overall" className="tile">
            <IconTrophy size={24} aria-hidden="true" />
            <span className="tile__title">Flygplatser</span>
            <span className="tile__meta">Bäst betygsatta i världen</span>
          </Link>
          <Link to="/top/lounges" className="tile">
            <IconLounge size={24} aria-hidden="true" />
            <span className="tile__title">Lounger</span>
            <span className="tile__meta">Högst betyg från resenärerna</span>
          </Link>
        </div>
      </section>

      <section className="section" aria-labelledby="ex-cont">
        <h2 className="section__title" id="ex-cont">
          Kontinenter
        </h2>
        <div className="grid grid--2">
          {CONTINENT_CODES.map((c) => (
            <Link key={c} to={`/top/overall?continent=${c}`} className="tile tile--continent" data-continent={c}>
              <span className="tile__code">{c}</span>
              <span className="tile__title">{continentName(c)}</span>
              <span className="tile__meta">
                {continentStats[c]
                  ? `${continentStats[c].checkins} check-ins · ${continentStats[c].countries} ${continentStats[c].countries === 1 ? 'land' : 'länder'}`
                  : 'Utforska'}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="section" aria-labelledby="ex-countries">
        <h2 className="section__title" id="ex-countries">
          Populära länder
        </h2>
        {countries.loading && <Spinner />}
        {countries.error && <ErrorState error={countries.error} onRetry={countries.reload} />}
        {countries.data && popular.length === 0 && <p className="muted">Inga check-ins ännu.</p>}
        {popular.length > 0 && (
          <ul className="list">
            {popular.map((c) => (
              <li key={c.code} className="list__item">
                <span className="badge" aria-hidden="true">
                  {c.code}
                </span>
                <div className="flex-1 min-w-0">
                  <Link to={`/country/${c.code}`} className="bold block">
                    {c.name}
                  </Link>
                  <span className="muted text-sm">
                    {c.airports} flygplatser · {c.checkins} check-ins
                  </span>
                </div>
                <RatingBadge
                  value={c.avgRating}
                  label={c.avgRating == null ? 'Inget betyg' : `Snittbetyg ${formatRating(c.avgRating)}`}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section" aria-labelledby="ex-cat">
        <h2 className="section__title" id="ex-cat">
          Bäst i kategori
        </h2>
        <div className="carousel" role="list">
          {SUB_RATINGS.map((c) => (
            <div className="carousel__item" role="listitem" key={c.key}>
              <CategoryRow cat={c} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
