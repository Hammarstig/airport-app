import { useState } from 'react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import {
  AIRPORT_TYPES,
  CONTINENT_CODES,
  MATCHED_ON_LABEL,
  continentName,
  sortedCountryOptions
} from '../../lib/format.js';
import { AirportRow } from '../../components/Rows.jsx';
import { EmptyState, Segmented } from '../../components/ui.jsx';
import { IconFilter, IconSearch } from '../../assets/icons.jsx';
import { PAGE, FilterSelect, Results, useSearchResults } from './shared.jsx';

const AIRPORT_SORTS = [
  { value: 'relevance', label: 'Relevans' },
  { value: 'rating', label: 'Betyg' },
  { value: 'checkins', label: 'Check-ins' },
  { value: 'name', label: 'Namn' }
];

export function AirportsTab({ qs, q }) {
  const { user } = useAuth();
  const f = {
    country: qs.get('country'),
    continent: qs.get('continent'),
    type: qs.get('type'),
    minRating: qs.get('minRating'),
    visited: qs.get('visited'),
    sort: qs.get('sort')
  };
  const sort = f.sort || (q ? 'relevance' : 'checkins');
  const params = {
    q: q || undefined,
    country: f.country,
    continent: f.continent,
    type: f.type,
    minRating: f.minRating,
    visited: user ? f.visited : undefined,
    sort,
    limit: PAGE
  };
  const key = JSON.stringify(params);
  const res = useSearchResults(key, (offset) => api.browseAirports({ ...params, offset }));
  const [open, setOpen] = useState(false);
  const activeCount = ['country', 'continent', 'type', 'minRating', 'visited'].filter((k) => f[k]).length;

  return (
    <div className="stack">
      <div className="sortbar">
        <button
          type="button"
          className="chip"
          aria-pressed={open}
          aria-expanded={open}
          aria-controls="airport-filters"
          onClick={() => setOpen((v) => !v)}
        >
          <IconFilter aria-hidden="true" /> Filter{activeCount ? ` (${activeCount})` : ''}
        </button>
        {activeCount > 0 && (
          <button
            type="button"
            className="chip"
            onClick={() => qs.set({ country: '', continent: '', type: '', minRating: '', visited: '' })}
          >
            Rensa filter
          </button>
        )}
        <span className="spacer" />
        <label className="visually-hidden" htmlFor="airport-sort">
          Sortering
        </label>
        <select
          id="airport-sort"
          className="select"
          style={{ width: 'auto' }}
          value={sort}
          onChange={(e) => qs.set({ sort: e.target.value })}
        >
          {AIRPORT_SORTS.filter((s) => q || s.value !== 'relevance').map((s) => (
            <option key={s.value} value={s.value}>
              Sortera: {s.label}
            </option>
          ))}
        </select>
      </div>

      {open && (
        <div id="airport-filters" className="filters" role="group" aria-label="Filter">
          <div className="grid grid--2">
            <FilterSelect
              id="f-country"
              label="Land"
              value={f.country}
              onChange={(v) => qs.set({ country: v })}
              options={sortedCountryOptions()}
              all="Alla länder"
            />
            <FilterSelect
              id="f-continent"
              label="Kontinent"
              value={f.continent}
              onChange={(v) => qs.set({ continent: v })}
              options={CONTINENT_CODES.map((c) => ({ value: c, label: continentName(c) }))}
              all="Alla kontinenter"
            />
            <FilterSelect
              id="f-type"
              label="Storlek"
              value={f.type}
              onChange={(v) => qs.set({ type: v })}
              options={AIRPORT_TYPES}
              all="Alla storlekar"
            />
            <FilterSelect
              id="f-min"
              label="Minsta betyg"
              value={f.minRating}
              onChange={(v) => qs.set({ minRating: v })}
              options={[4.5, 4, 3.5, 3, 2].map((n) => ({ value: String(n), label: `${String(n).replace('.', ',')}+` }))}
              all="Alla betyg"
            />
            {user && (
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <span className="field__label">Besökta</span>
                <Segmented
                  name="visited"
                  label="Besökta"
                  value={f.visited || 'any'}
                  onChange={(v) => qs.set({ visited: v === 'any' ? '' : v })}
                  options={[
                    { value: 'any', label: 'Alla' },
                    { value: 'mine', label: 'Besökt av mig' },
                    { value: 'notmine', label: 'Ej besökt' }
                  ]}
                />
              </div>
            )}
          </div>
        </div>
      )}

      <Results res={res} empty={<EmptyState icon={IconSearch} title="Inga flygplatser matchar" />}>
        <ul className="list" aria-label="Flygplatser">
          {res.items.map((a) => (
            <AirportRow
              key={a.iata}
              airport={a}
              avgRating={a.avgRating}
              checkins={a.checkins ?? 0}
              extra={
                q && a.matchedOn
                  ? `matchade ${(MATCHED_ON_LABEL[a.matchedOn] || a.matchedOn).toLowerCase()}`
                  : undefined
              }
            />
          ))}
        </ul>
      </Results>
    </div>
  );
}
