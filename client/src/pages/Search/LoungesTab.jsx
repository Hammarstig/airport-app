import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { sortedCountryOptions } from '../../lib/format.js';
import { LoungeRow } from '../../components/Rows.jsx';
import { EmptyState } from '../../components/ui.jsx';
import { IconSearch } from '../../assets/icons.jsx';
import { PAGE, FilterSelect, Results, useSearchResults } from './shared.jsx';

export function LoungesTab({ qs, q }) {
  const country = qs.get('country');
  const sort = qs.get('sort') || 'rating';
  const params = { q: q || undefined, country: country || undefined, sort, limit: PAGE };
  const res = useSearchResults(JSON.stringify(params), (offset) => api.lounges({ ...params, offset }));
  return (
    <div className="stack">
      <div className="grid grid--2">
        <FilterSelect
          id="l-country"
          label="Land"
          value={country}
          onChange={(v) => qs.set({ country: v })}
          options={sortedCountryOptions()}
          all="Alla länder"
        />
        <div className="field">
          <label className="field__label" htmlFor="l-sort">
            Sortering
          </label>
          <select id="l-sort" className="select" value={sort} onChange={(e) => qs.set({ sort: e.target.value })}>
            <option value="rating">Betyg</option>
            <option value="reviews">Antal recensioner</option>
            <option value="name">Namn</option>
          </select>
        </div>
      </div>
      <div className="row">
        <Link to="/top/lounges" className="btn btn--ghost btn--sm">
          Topplista lounger
        </Link>
      </div>
      <Results res={res} empty={<EmptyState icon={IconSearch} title="Inga lounger matchar" />}>
        <ul className="list" aria-label="Lounger">
          {res.items.map((l) => (
            <LoungeRow key={l.id} lounge={l} />
          ))}
        </ul>
      </Results>
    </div>
  );
}
