import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { TRAVEL_CLASSES, formatDate } from '../../lib/format.js';
import { AirportAutocomplete, AirlineAutocomplete } from '../../components/AirportAutocomplete.jsx';
import { AirlineTag, ClassChip } from '../../components/TravelDetails.jsx';
import { EmptyState, IataTag, Stars } from '../../components/ui.jsx';
import { Snippet } from '../../components/Snippet.jsx';
import { IconSearch } from '../../assets/icons.jsx';
import { PAGE, FilterSelect, Results, useSearchResults } from './shared.jsx';

export function ReviewsTab({ qs, q }) {
  const [iataAirport, setIataAirport] = useState(null);
  const iata = qs.get('iata');
  const minRating = qs.get('minRating');
  const airline = qs.get('airline');
  const travelClass = qs.get('travelClass');
  const [airlineObj, setAirlineObj] = useState(airline ? { iata: airline, name: airline } : null);
  const enabled = !!(q || iata);
  const params = {
    q: q || undefined,
    iata: iata || undefined,
    minRating: minRating || undefined,
    airline: airline || undefined,
    travelClass: travelClass || undefined,
    limit: PAGE
  };
  const res = useSearchResults(JSON.stringify(params), (offset) => api.search({ ...params, offset }), enabled);

  useEffect(() => {
    if (iata && (!iataAirport || iataAirport.iata !== iata))
      api
        .airport(iata)
        .then(setIataAirport)
        .catch(() => {});
    if (!iata) setIataAirport(null);
  }, [iata]); // eslint-disable-line react-hooks/exhaustive-deps -- hämta bara när IATA i URL:en ändras

  return (
    <div className="stack">
      <div className="grid grid--2">
        <AirportAutocomplete
          label="Begränsa till flygplats"
          value={iataAirport}
          onSelect={(a) => {
            setIataAirport(a);
            qs.set({ iata: a ? a.iata : '' });
          }}
        />
        <FilterSelect
          id="r-min"
          label="Minsta betyg"
          value={minRating}
          onChange={(v) => qs.set({ minRating: v })}
          options={[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n}+` }))}
          all="Alla betyg"
        />
        <AirlineAutocomplete
          label="Flygbolag"
          value={airlineObj}
          onSelect={(a) => {
            setAirlineObj(a);
            qs.set({ airline: a ? a.iata : '' });
          }}
        />
        <FilterSelect
          id="r-class"
          label="Reseklass"
          value={travelClass}
          onChange={(v) => qs.set({ travelClass: v })}
          options={TRAVEL_CLASSES}
          all="Alla klasser"
        />
      </div>
      {!enabled ? (
        <EmptyState icon={IconSearch} title="Sök i kommentarer och loungerecensioner">
          <p className="muted">Skriv ett sökord, till exempel ”wifi” eller ”kö”, eller välj en flygplats.</p>
        </EmptyState>
      ) : (
        <Results res={res} empty={<EmptyState icon={IconSearch} title="Inga recensioner matchar" />}>
          <ul className="list" aria-label="Recensioner">
            {res.items.map((h) => (
              <li key={`${h.type}-${h.id}`} className="list__item search-hit block">
                <div className="row items-center gap-2">
                  <IataTag iata={h.airport.iata} />
                  <div className="flex-1 min-w-0">
                    <Link to={`/airport/${h.airport.iata}`} className="bold">
                      {h.type === 'lounge_review' && h.loungeName ? h.loungeName : h.airport.name}
                    </Link>
                    <div className="muted text-sm">
                      {h.type === 'lounge_review' ? 'Loungerecension' : 'Check-in'} av{' '}
                      <Link to={`/u/${h.user.username}`}>{h.user.displayName || h.user.username}</Link> ·{' '}
                      {formatDate(h.visitedOn)}
                    </div>
                  </div>
                  {h.rating != null && <Stars value={h.rating} />}
                </div>
                {(h.airline || h.travelClass) && (
                  <div className="row mt-2 gap-2">
                    <AirlineTag airline={h.airline} />
                    <ClassChip travelClass={h.travelClass} />
                  </div>
                )}
                <Snippet className="search-hit__snippet" parts={h.snippetParts} snippet={h.snippet} />
              </li>
            ))}
          </ul>
        </Results>
      )}
    </div>
  );
}
