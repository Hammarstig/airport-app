import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useDebounced } from '../../hooks/useDebounced.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { AIRPORT_PLACEHOLDER } from '../../components/AirportAutocomplete.jsx';
import { Tabs } from '../../components/ui.jsx';
import { IconSearch } from '../../assets/icons.jsx';
import { useQueryState } from './shared.jsx';
import { AirportsTab } from './AirportsTab.jsx';
import { ReviewsTab } from './ReviewsTab.jsx';
import { LoungesTab } from './LoungesTab.jsx';
import { UsersTab } from './UsersTab.jsx';

const TABS = [
  { value: 'airports', label: 'Flygplatser' },
  { value: 'reviews', label: 'Recensioner' },
  { value: 'lounges', label: 'Lounger' },
  { value: 'users', label: 'Användare' }
];

const PLACEHOLDER = {
  airports: AIRPORT_PLACEHOLDER,
  reviews: 'Sök i kommentarer och recensioner',
  lounges: 'Sök lounge',
  users: 'Sök användare'
};

export default function SearchPage() {
  useDocumentTitle('Sök');
  const qs = useQueryState();
  const navigate = useNavigate();
  const tab = TABS.some((t) => t.value === qs.get('tab')) ? qs.get('tab') : 'airports';
  const [text, setText] = useState(qs.get('q'));
  const q = useDebounced(text.trim(), 300);

  useEffect(() => {
    if (q !== qs.get('q')) qs.set({ q });
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const switchTab = (t) => {
    // Behåll bara sökord vid flikbyte - filtren skiljer sig per flik.
    const next = new URLSearchParams();
    next.set('tab', t);
    if (q) next.set('q', q);
    navigate({ search: `?${next}` }, { replace: true });
  };

  const onSubmit = (e) => {
    e.preventDefault();
    qs.set({ q: text.trim() });
    // Exakt IATA-kod i flygplatsfliken: gå direkt till flygplatsen.
    if (tab === 'airports' && /^[a-zA-Z]{3}$/.test(text.trim())) {
      api
        .airport(text.trim().toUpperCase())
        .then((a) => navigate(`/airport/${a.iata}`))
        .catch(() => {});
    }
  };

  return (
    <div className="page">
      <header className="page__header">
        <h1 className="page__title">Sök</h1>
        <p className="page__subtitle">Flygplatser, recensioner, lounger och resenärer.</p>
      </header>

      <form role="search" onSubmit={onSubmit} className="stack">
        <label htmlFor="search-q" className="visually-hidden">
          Sökord
        </label>
        <div className="searchbar">
          <IconSearch size={18} aria-hidden="true" />
          <input
            id="search-q"
            className="searchbar__input"
            type="search"
            enterKeyHint="search"
            placeholder={PLACEHOLDER[tab]}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
      </form>

      <div style={{ marginTop: 12 }}>
        <Tabs tabs={TABS} value={tab} onChange={switchTab} label="Sökkategorier" />
      </div>
      <div role="tabpanel" aria-labelledby={`tab-${tab}`} style={{ marginTop: 16 }}>
        {tab === 'airports' && <AirportsTab qs={qs} q={q} />}
        {tab === 'reviews' && <ReviewsTab qs={qs} q={q} />}
        {tab === 'lounges' && <LoungesTab qs={qs} q={q} />}
        {tab === 'users' && <UsersTab q={q} />}
      </div>
    </div>
  );
}
