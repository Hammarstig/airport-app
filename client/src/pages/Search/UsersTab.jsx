import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { Avatar, EmptyState } from '../../components/ui.jsx';
import { IconSearch } from '../../assets/icons.jsx';
import { PAGE, Results, useSearchResults } from './shared.jsx';

export function UsersTab({ q }) {
  const res = useSearchResults(q, () => api.users(q, PAGE), !!q);
  if (!q) {
    return (
      <EmptyState icon={IconSearch} title="Hitta andra resenärer">
        <p className="muted">Sök på användarnamn eller visningsnamn.</p>
      </EmptyState>
    );
  }
  return (
    <Results res={{ ...res, hasMore: false }} empty={<EmptyState icon={IconSearch} title="Inga användare hittades" />}>
      <ul className="list" aria-label="Användare">
        {res.items.map((u) => (
          <li key={u.username} className="list__item">
            <Avatar user={u} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <Link to={`/u/${u.username}`} style={{ fontWeight: 600, display: 'block' }}>
                {u.displayName || u.username}
              </Link>
              <span className="muted" style={{ fontSize: '0.85em' }}>
                @{u.username}
                {u.homeIata ? ` · ${u.homeIata}` : ''}
              </span>
            </div>
            <span>
              <strong>{u.uniqueAirports ?? 0}</strong> <span className="muted">flygplatser</span>
            </span>
          </li>
        ))}
      </ul>
    </Results>
  );
}
