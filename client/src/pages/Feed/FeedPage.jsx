import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { usePaged } from '../../hooks/usePaged.js';
import { CheckinList } from '../../components/CheckinList.jsx';
import { OfflineQueueStatus } from '../../components/OfflineQueueStatus.jsx';
import { EmptyState, Tabs } from '../../components/ui.jsx';
import { IconPlane, IconPlus, IconUsers } from '../../assets/icons.jsx';
import { FeedSidebar } from './FeedSidebar.jsx';

const TABS = [
  { value: 'friends', label: 'Vänner' },
  { value: 'global', label: 'Alla' },
  { value: 'mine', label: 'Mina' }
];

/** Standardflik: Vänner om man följer någon, annars Alla. */
function useDefaultScope(user) {
  const [def, setDef] = useState(() => {
    if (!user) return 'global';
    const p = api.peek.user(user.username);
    return p ? (p.following > 0 ? 'friends' : 'global') : null;
  });
  useEffect(() => {
    if (!user || def) return;
    api
      .user(user.username)
      .then((p) => setDef(p.following > 0 ? 'friends' : 'global'))
      .catch(() => setDef('global'));
  }, [user, def]);
  return user ? def : 'global';
}

function Empty({ scope }) {
  if (scope === 'friends') {
    return (
      <EmptyState icon={IconUsers} title="Inga check-ins från vänner ännu">
        <p className="muted">Följ andra resenärer för att se deras flygplatsbesök här.</p>
        <Link to="/search?tab=users" className="btn btn--primary">
          Hitta resenärer
        </Link>
      </EmptyState>
    );
  }
  return (
    <EmptyState icon={IconPlane} title={scope === 'mine' ? 'Du har inga check-ins ännu' : 'Inga check-ins ännu'}>
      <Link to="/checkin" className="btn btn--primary">
        <IconPlus size={18} aria-hidden="true" /> Checka in
      </Link>
    </EmptyState>
  );
}

export default function FeedPage() {
  useDocumentTitle('Flöde');
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const def = useDefaultScope(user);
  const chosen = TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : null;
  const scope = user ? chosen || def : 'global';
  const paged = usePaged(
    (limit, offset) => (scope ? api.feed(limit, offset, scope) : Promise.resolve([])),
    [scope],
    20,
    (limit) => (scope ? api.peek.feed(limit, 0, scope) : undefined)
  );

  return (
    <div className="page">
      <div className="layout-split">
        <div className="min-w-0">
          <header className="page__header">
            <h1 className="page__title">Flöde</h1>
          </header>

          {!user && (
            <div className="card">
              <div className="card__body stack">
                <p>Logga dina flygplatsbesök, betygsätt lounger, samla märken och tävla med vänner.</p>
                <div className="row">
                  <Link to="/register" className="btn btn--primary">
                    Skapa konto
                  </Link>
                  <Link to="/login" className="btn btn--ghost">
                    Logga in
                  </Link>
                </div>
              </div>
            </div>
          )}

          <OfflineQueueStatus />

          {user && (
            <Tabs label="Flöde" value={scope} onChange={(t) => setParams({ tab: t }, { replace: true })} tabs={TABS} />
          )}
          <div
            role={user ? 'tabpanel' : undefined}
            aria-labelledby={user ? `tab-${scope}` : undefined}
            className="tabpanel"
          >
            <CheckinList paged={paged} empty={<Empty scope={scope} />} />
          </div>
        </div>
        {user && <FeedSidebar username={user.username} />}
      </div>
    </div>
  );
}
