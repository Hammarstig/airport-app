import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { usePaged } from '../../hooks/usePaged.js';
import { UserRow } from '../../components/UserRow.jsx';
import { SkeletonRows } from '../../components/Skeleton.jsx';
import { EmptyState, ErrorState, Tabs } from '../../components/ui.jsx';
import { IconUsers } from '../../assets/icons.jsx';

/** Följare / Följer för en användare. */
export default function FollowPage({ list }) {
  const { username } = useParams();
  const navigate = useNavigate();
  useDocumentTitle(list === 'followers' ? `Följare - ${username}` : `Följer - ${username}`);
  const fetcher = list === 'followers' ? api.followers : api.following;
  const peek = list === 'followers' ? api.peek.followers : api.peek.following;
  const paged = usePaged(
    (limit, offset) => fetcher(username, limit, offset),
    [username, list],
    50,
    (limit) => peek(username, limit, 0)
  );

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <p className="page__subtitle">
            <Link to={`/u/${username}`}>@{username}</Link>
          </p>
          <h1 className="page__title">{list === 'followers' ? 'Följare' : 'Följer'}</h1>
        </div>
      </header>
      <Tabs
        label="Följare och följer"
        value={list}
        onChange={(t) => navigate(`/u/${username}/${t}`, { replace: true })}
        tabs={[
          { value: 'followers', label: 'Följare' },
          { value: 'following', label: 'Följer' }
        ]}
      />
      <div role="tabpanel" aria-labelledby={`tab-${list}`} className="tabpanel">
        {paged.error && !paged.items.length && <ErrorState error={paged.error} onRetry={paged.reload} />}
        {paged.loading && !paged.items.length && <SkeletonRows count={5} />}
        {!paged.loading && !paged.error && !paged.items.length && (
          <EmptyState icon={IconUsers} title={list === 'followers' ? 'Inga följare ännu' : 'Följer ingen ännu'}>
            <Link to="/search?tab=users" className="btn btn--primary btn--sm">
              Hitta resenärer
            </Link>
          </EmptyState>
        )}
        {paged.items.length > 0 && (
          <ul className="list">
            {paged.items.map((u) => (
              <UserRow key={u.username} user={u} follow />
            ))}
          </ul>
        )}
        {!paged.loading && paged.hasMore && (
          <button type="button" className="btn btn--ghost btn--block" onClick={paged.loadMore}>
            Ladda fler
          </button>
        )}
      </div>
    </div>
  );
}
