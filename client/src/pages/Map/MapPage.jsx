import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAsync } from '../../hooks/useAsync.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { PageSkeleton } from '../../components/Skeleton.jsx';
import { ErrorState, StatRow } from '../../components/ui.jsx';
import NotFoundPage from '../NotFound/NotFoundPage.jsx';
import { WorldMap } from './WorldMap.jsx';
import { CountryMap } from './CountryMap.jsx';
import { CoverageTable } from './CoverageTable.jsx';
import { AirportCoverageList } from './AirportCoverageList.jsx';

const pctText = (p) => `${String(p ?? 0).replace('.', ',')} %`;

function ScopeToggle({ scope, onChange }) {
  return (
    <div className="map-toggle" role="group" aria-label="Räkna mot">
      <button type="button" aria-pressed={scope === 'scheduled'} onClick={() => onChange('scheduled')}>
        Reguljärtrafik
      </button>
      <button type="button" aria-pressed={scope === 'all'} onClick={() => onChange('all')}>
        Alla flygplatser
      </button>
    </div>
  );
}

function WorldView({ username, scope }) {
  const { data, loading, error, reload } = useAsync(
    () => api.userMap(username, scope),
    [username, scope],
    () => api.peek.userMap(username, scope)
  );
  if (error?.status === 404) return <NotFoundPage message={`Användaren ${username} finns inte.`} />;
  if (loading && !data) return <PageSkeleton />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const countries = [...data.countries].sort(
    (a, b) => b.pct - a.pct || b.visited - a.visited || a.name.localeCompare(b.name, 'sv')
  );
  const visitedCountries = countries.filter((c) => c.visited > 0);
  const q = scope === 'all' ? '?scope=all' : '';

  return (
    <div className="stack stack--lg">
      <StatRow
        label="Täckning"
        items={[
          [pctText(data.totals.pct), 'av världens flygplatser'],
          [`${data.totals.visited} / ${data.totals.total}`, 'Besökta flygplatser'],
          [visitedCountries.length, 'Länder']
        ]}
      />
      <WorldMap username={username} countries={data.countries} />
      <section className="section" aria-labelledby="cont-title">
        <h2 className="section__title" id="cont-title">
          Kontinenter
        </h2>
        <CoverageTable rows={data.continents} caption="Täckning per kontinent" nameHeader="Kontinent" />
      </section>
      <section className="section" aria-labelledby="country-title">
        <h2 className="section__title" id="country-title">
          Länder
        </h2>
        {visitedCountries.length === 0 ? (
          <p className="muted">Inga besökta länder ännu.</p>
        ) : (
          <CoverageTable
            rows={visitedCountries}
            caption="Besökta länder sorterade efter andel besökta flygplatser"
            nameHeader="Land"
            linkTo={(r) => `/u/${username}/map/${r.code}${q}`}
          />
        )}
      </section>
    </div>
  );
}

function CountryView({ username, code, scope }) {
  const { data, loading, error, reload } = useAsync(
    () => api.userCountryMap(username, code, scope),
    [username, code, scope],
    () => api.peek.userCountryMap(username, code, scope)
  );
  if (error?.status === 404) return <NotFoundPage message={`Hittade inga data för ${code}.`} />;
  if (loading && !data) return <PageSkeleton />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const c = data.country;
  const regions = [...(data.regions || [])].sort((a, b) => b.pct - a.pct || a.name.localeCompare(b.name, 'sv'));

  return (
    <div className="stack stack--lg">
      <div className="row" style={{ alignItems: 'baseline' }}>
        <h2 className="section__title mt-0 mb-0">{c.name}</h2>
        <span className="spacer" />
        <Link to={`/country/${c.code}`} className="btn btn--ghost btn--sm">
          Landets sida
        </Link>
      </div>
      <StatRow
        label="Täckning"
        items={[
          [pctText(c.pct), 'av landets flygplatser'],
          [`${c.visited} / ${c.total}`, 'Besökta flygplatser']
        ]}
      />
      <CountryMap code={c.code} airports={data.airports || []} />
      {regions.length > 0 && (
        <section className="section" aria-labelledby="reg-title">
          <h2 className="section__title" id="reg-title">
            Regioner
          </h2>
          <CoverageTable rows={regions} caption={`Täckning per region i ${c.name}`} nameHeader="Region" />
        </section>
      )}
      <AirportCoverageList airports={data.airports || []} />
    </div>
  );
}

export default function MapPage() {
  const { username, country } = useParams();
  const [params, setParams] = useSearchParams();
  const scope = params.get('scope') === 'all' ? 'all' : 'scheduled';
  const code = country ? country.toUpperCase() : null;
  useDocumentTitle(code ? `Karta ${code} - ${username}` : `Karta - ${username}`);

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <p className="page__subtitle mt-0 mb-0">
            <Link to={`/u/${username}`}>@{username}</Link>
            {code && (
              <>
                {' / '}
                <Link to={`/u/${username}/map${scope === 'all' ? '?scope=all' : ''}`}>Världen</Link>
              </>
            )}
          </p>
          <h1 className="page__title">{code ? 'Landskarta' : 'Karta'}</h1>
        </div>
        <ScopeToggle
          scope={scope}
          onChange={(s) => setParams(s === 'all' ? { scope: 'all' } : {}, { replace: true })}
        />
      </header>
      {code ? (
        <CountryView username={username} code={code} scope={scope} />
      ) : (
        <WorldView username={username} scope={scope} />
      )}
    </div>
  );
}
