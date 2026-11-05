import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAsync } from '../../hooks/useAsync.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import {
  AIRPORT_TYPES,
  CATEGORIES,
  CONTINENT_CODES,
  categoryLabel,
  continentName,
  sortedCountryOptions
} from '../../lib/format.js';
import { AirportRow, LoungeRow } from '../../components/Rows.jsx';
import { EmptyState, ErrorState, Spinner } from '../../components/ui.jsx';
import { IconTrophy } from '../../assets/icons.jsx';
import NotFoundPage from '../NotFound/NotFoundPage.jsx';

function Select({ id, label, value, onChange, options, all }) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <select id={id} className="select" value={value} onChange={(e) => onChange(e.target.value)}>
        {all && <option value="">{all}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function TopLounges() {
  useDocumentTitle('Bästa lounger');
  const { data, loading, error, reload } = useAsync(() => api.loungeRankings({ limit: 50, minReviews: 1 }), []);
  return (
    <div className="page">
      <header className="page__header">
        <h1 className="page__title">Bästa lounger</h1>
        <p className="page__subtitle">Högst betygsatta lounger enligt resenärernas recensioner.</p>
      </header>
      {loading && <Spinner />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && data.length === 0 && <EmptyState icon={IconTrophy} title="Inga loungerecensioner ännu" />}
      {data && data.length > 0 && (
        <ol className="list">
          {data.map((r) => (
            <LoungeRow
              key={r.lounge.id}
              rank={r.rank}
              lounge={r.lounge}
              airport={r.airport}
              avgRating={r.avgRating}
              reviewCount={r.reviewCount}
            />
          ))}
        </ol>
      )}
    </div>
  );
}

function TopCategory({ category }) {
  const [params, setParams] = useSearchParams();
  const country = params.get('country') || '';
  const continent = params.get('continent') || '';
  const type = params.get('type') || '';
  const label = categoryLabel(category);
  useDocumentTitle(`Topplista ${label.toLowerCase()}`);
  const { data, loading, error, reload } = useAsync(
    () =>
      api.airportRankings({
        category,
        country: country || undefined,
        continent: continent || undefined,
        type: type || undefined,
        minRatings: 1,
        limit: 50
      }),
    [category, country, continent, type]
  );
  const set = (k, v) => {
    const n = new URLSearchParams(params);
    if (v) n.set(k, v);
    else n.delete(k);
    setParams(n, { replace: true });
  };

  return (
    <div className="page">
      <header className="page__header">
        <h1 className="page__title">
          {category === 'overall' ? 'Bäst betygsatta flygplatser' : `Bäst på ${label.toLowerCase()}`}
        </h1>
        <p className="page__subtitle">
          {[continent && continentName(continent), country && sortedCountryOptions([country])[0].label]
            .filter(Boolean)
            .join(', ') || 'Hela världen'}
        </p>
      </header>

      <nav className="tabs" aria-label="Kategorier" style={{ overflowX: 'auto' }}>
        {CATEGORIES.map((c) => (
          <Link
            key={c.key}
            to={`/top/${c.key}${params.toString() ? `?${params}` : ''}`}
            className={`tab${c.key === category ? ' tab--active' : ''}`}
            aria-current={c.key === category ? 'page' : undefined}
          >
            {c.label}
          </Link>
        ))}
      </nav>

      <div className="filters mt-4" role="group" aria-label="Filter">
        <div className="grid grid--3">
          <Select
            id="t-country"
            label="Land"
            value={country}
            onChange={(v) => set('country', v)}
            options={sortedCountryOptions()}
            all="Alla länder"
          />
          <Select
            id="t-continent"
            label="Kontinent"
            value={continent}
            onChange={(v) => set('continent', v)}
            options={CONTINENT_CODES.map((c) => ({ value: c, label: continentName(c) }))}
            all="Alla kontinenter"
          />
          <Select
            id="t-type"
            label="Storlek"
            value={type}
            onChange={(v) => set('type', v)}
            options={AIRPORT_TYPES}
            all="Alla storlekar"
          />
        </div>
      </div>

      <div className="mt-4">
        {loading && <Spinner />}
        {error && <ErrorState error={error} onRetry={reload} />}
        {data && data.length === 0 && <EmptyState icon={IconTrophy} title="Inga betyg i denna kategori ännu" />}
        {data && data.length > 0 && (
          <ol className="list" aria-label={`Topplista ${label}`}>
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

export default function TopPage() {
  const { category } = useParams();
  if (category === 'lounges') return <TopLounges />;
  if (!CATEGORIES.some((c) => c.key === category)) return <NotFoundPage message="Okänd kategori." />;
  return <TopCategory category={category} />;
}
