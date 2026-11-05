import { api } from '../../lib/api.js';
import { useAsync } from '../../hooks/useAsync.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';

// Visas om servern inte svarar (t.ex. offline). Samma innehåll som GET /api/attributions.
const FALLBACK = [
  {
    name: 'OurAirports',
    url: 'https://ourairports.com/data/',
    license: 'Public domain',
    licenseUrl: 'https://ourairports.com/about.html#credits',
    usage: 'Flygplatser, IATA/ICAO-koder, koordinater och regioner'
  },
  {
    name: 'OpenFlights',
    url: 'https://openflights.org/data.php',
    license: 'Open Database License (ODbL) 1.0',
    licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
    usage: 'Flygbolag (namn, IATA- och ICAO-koder)'
  },
  {
    name: 'Natural Earth / world-atlas',
    url: 'https://github.com/topojson/world-atlas',
    license: 'Public domain (Natural Earth), ISC (world-atlas)',
    licenseUrl: 'https://www.naturalearthdata.com/about/terms-of-use/',
    usage: 'Landsgränser i kartvyn'
  }
];

export default function AboutPage() {
  useDocumentTitle('Om Gatelog');
  const { data } = useAsync(
    () => api.attributions(),
    [],
    () => api.peek.attributions()
  );
  const sources = data && data.length ? data : FALLBACK;

  return (
    <div className="page">
      <header className="page__header">
        <h1 className="page__title">Om Gatelog</h1>
      </header>
      <p>
        Gatelog är en loggbok för flygplatser: checka in där du är, betygsätt säkerhetskontroll, mat, wifi och lounger,
        samla märken, följ vänner och se hur stor del av världens flygplatser du har besökt. Endast flygplatser med
        IATA-kod finns med.
      </p>

      <h2 className="section__title">Datakällor och licenser</h2>
      <ul className="list">
        {sources.map((s) => (
          <li key={s.name} className="list__item">
            <div className="flex-1 min-w-0">
              <a href={s.url} target="_blank" rel="noopener noreferrer">
                <strong>{s.name}</strong>
              </a>
              <div className="muted text-sm">{s.usage}</div>
              <div className="text-sm">
                Licens:{' '}
                {s.licenseUrl ? (
                  <a href={s.licenseUrl} target="_blank" rel="noopener noreferrer">
                    {s.license}
                  </a>
                ) : (
                  s.license
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
      <p className="muted text-sm">
        Flygbolagsdata från OpenFlights används under ODbL. Bearbetningar av databasen delas under samma licens.
      </p>
    </div>
  );
}
