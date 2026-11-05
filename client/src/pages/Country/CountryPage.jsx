import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAsync } from '../../hooks/useAsync.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { usePaged } from '../../hooks/usePaged.js';
import { continentName, formatRating } from '../../lib/format.js';
import { AirportRow } from '../../components/Rows.jsx';
import { EmptyState, ErrorState, Segmented, Spinner, Stat } from '../../components/ui.jsx';
import { IconPlane } from '../../assets/icons.jsx';
import NotFoundPage from '../NotFound/NotFoundPage.jsx';

const SORTS = [
  { value: 'checkins', label: 'Check-ins' },
  { value: 'rating', label: 'Betyg' },
  { value: 'name', label: 'Namn' }
];

export default function CountryPage() {
  const code = (useParams().code || '').toUpperCase();
  const { data: c, loading, error, reload } = useAsync(() => api.country(code), [code]);
  const [sort, setSort] = useState('checkins');
  const paged = usePaged(
    (limit, offset) => api.browseAirports({ country: code, sort, limit, offset }),
    [code, sort],
    30
  );
  useDocumentTitle(c ? c.name : code);

  if (loading)
    return (
      <div className="page">
        <Spinner />
      </div>
    );
  if (error?.status === 404) return <NotFoundPage message={`Landet ${code} finns inte.`} />;
  if (error)
    return (
      <div className="page">
        <ErrorState error={error} onRetry={reload} />
      </div>
    );

  return (
    <div className="page">
      <header className="airport-hero">
        <div className="airport-hero__code">{c.code}</div>
        <h1 className="airport-hero__name">{c.name}</h1>
        <p className="airport-hero__place">
          <Link to={`/top/overall?continent=${c.continent}`}>{continentName(c.continent)}</Link>
        </p>
      </header>

      <section className="section" aria-label="Statistik">
        <div className="grid grid--2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
          <Stat value={c.airports ?? 0} label="Flygplatser" />
          <Stat value={c.checkins ?? 0} label="Check-ins" />
          <Stat value={c.visitors ?? 0} label="Besökare" />
          <Stat value={formatRating(c.avgRating)} label="Snittbetyg" />
        </div>
      </section>

      <section className="section" aria-labelledby="c-top">
        <h2 className="section__title" id="c-top">
          Topp 10 i {c.name}
        </h2>
        {(c.topAirports || []).length === 0 ? (
          <EmptyState icon={IconPlane} title="Inga betygsatta flygplatser ännu" />
        ) : (
          <ol className="list">
            {c.topAirports.map((r, i) => (
              <AirportRow
                key={r.airport.iata}
                rank={i + 1}
                airport={r.airport}
                avgRating={r.avgRating}
                ratingCount={r.ratingCount}
                checkins={r.checkins}
              />
            ))}
          </ol>
        )}
        <div className="row" style={{ marginTop: 8 }}>
          <Link to={`/top/overall?country=${c.code}`} className="btn btn--ghost btn--sm">
            Kategoritopplistor för {c.name}
          </Link>
        </div>
      </section>

      <section className="section" aria-labelledby="c-all">
        <h2 className="section__title" id="c-all">
          Alla flygplatser
        </h2>
        <Segmented options={SORTS} value={sort} onChange={setSort} label="Sortera flygplatser" name="country-sort" />
        <ul className="list" style={{ marginTop: 12 }}>
          {paged.items.map((a) => (
            <AirportRow key={a.iata} airport={a} avgRating={a.avgRating} checkins={a.checkins ?? 0} />
          ))}
        </ul>
        {paged.loading && <Spinner />}
        {paged.error && <ErrorState error={paged.error} onRetry={paged.reload} />}
        {!paged.loading && paged.hasMore && (
          <button type="button" className="btn btn--ghost btn--block" onClick={paged.loadMore}>
            Ladda fler
          </button>
        )}
      </section>
    </div>
  );
}
