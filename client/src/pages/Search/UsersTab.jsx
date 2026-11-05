import { api } from '../../lib/api.js';
import { UserRow } from '../../components/UserRow.jsx';
import { EmptyState } from '../../components/ui.jsx';
import { IconUsers } from '../../assets/icons.jsx';
import { PAGE, Results, useSearchResults } from './shared.jsx';

/** Hitta vänner: sök på användarnamn eller visningsnamn och följ direkt i listan. */
export function UsersTab({ q }) {
  const res = useSearchResults(q, () => api.users(q, PAGE), !!q);
  if (!q) {
    return (
      <EmptyState icon={IconUsers} title="Hitta vänner och andra resenärer">
        <p className="muted">Sök på användarnamn eller namn och tryck Följ för att se deras check-ins i ditt flöde.</p>
      </EmptyState>
    );
  }
  return (
    <Results res={{ ...res, hasMore: false }} empty={<EmptyState icon={IconUsers} title="Inga användare hittades" />}>
      <ul className="list" aria-label="Användare">
        {res.items.map((u) => (
          <UserRow key={u.username} user={u} meta={`${u.uniqueAirports ?? 0} flygplatser`} follow />
        ))}
      </ul>
    </Results>
  );
}
