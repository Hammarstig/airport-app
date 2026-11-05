import { api } from '../lib/api.js';
import { MATCHED_ON_LABEL, countryName } from '../lib/format.js';
import { Combobox } from './Combobox.jsx';

export const AIRPORT_PLACEHOLDER = 'Sök stad, flygplats, land eller IATA-kod';

export function AirportOption({ airport: a }) {
  const country = a.countryName || countryName(a.country);
  return (
    <>
      <span className="iata-tag">{a.iata}</span>
      <span className="flex-1 min-w-0">
        <span className="bold block">{a.name}</span>
        <span className="muted text-sm">{[a.city, country].filter(Boolean).join(', ')}</span>
      </span>
      {a.matchedOn && (
        <span className="match-hint" title="Matchade på">
          {MATCHED_ON_LABEL[a.matchedOn] || a.matchedOn}
        </span>
      )}
    </>
  );
}

export function AirportAutocomplete({ label = 'Flygplats', placeholder = AIRPORT_PLACEHOLDER, ...rest }) {
  return (
    <Combobox
      label={label}
      placeholder={placeholder}
      fetcher={(q, signal) => api.searchAirports(q, 8, signal)}
      itemKey={(a) => a.iata}
      itemText={(a) => `${a.iata} - ${a.name}`}
      renderItem={(a) => <AirportOption airport={a} />}
      noHitsText="Inga flygplatser hittades. Endast flygplatser med IATA-kod finns."
      listLabel="Förslag på flygplatser"
      {...rest}
    />
  );
}

export function AirlineAutocomplete({
  label = 'Flygbolag',
  placeholder = 'Sök flygbolag eller IATA-kod, t.ex. SK',
  ...rest
}) {
  return (
    <Combobox
      label={label}
      placeholder={placeholder}
      fetcher={(q, signal) => api.airlines(q, 8, signal)}
      itemKey={(a) => a.iata}
      itemText={(a) => `${a.iata} - ${a.name}`}
      renderItem={(a) => (
        <>
          <span className="airline-tag__code">{a.iata}</span>
          <span className="flex-1 min-w-0">
            <span className="bold block">{a.name}</span>
            {a.country && <span className="muted text-sm">{a.country}</span>}
          </span>
        </>
      )}
      noHitsText="Inga flygbolag hittades."
      listLabel="Förslag på flygbolag"
      {...rest}
    />
  );
}
