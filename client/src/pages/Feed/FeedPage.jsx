import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { usePaged } from '../../hooks/usePaged.js';
import { CheckinList } from '../../components/CheckinList.jsx';
import { EmptyState, Tabs } from '../../components/ui.jsx';
import { IconPlane, IconPlus } from '../../assets/icons.jsx';

export default function FeedPage() {
  useDocumentTitle('Flöde');
  const { user } = useAuth();
  const [scope, setScope] = useState('global');
  const effective = user ? scope : 'global';
  const paged = usePaged((limit, offset) => api.feed(limit, offset, effective), [effective]);

  return (
    <div className="page">
      <header className="page__header">
        <h1 className="page__title">Flöde</h1>
        <p className="page__subtitle">Senaste check-ins från resenärer världen över.</p>
      </header>

      {!user && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card__body stack">
            <p style={{ margin: 0 }}>Logga dina flygplatsbesök, betygsätt lounger och klättra på topplistan.</p>
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

      {user && (
        <div style={{ marginBottom: 16 }}>
          <Tabs
            label="Flöde"
            value={scope}
            onChange={setScope}
            tabs={[
              { value: 'global', label: 'Alla' },
              { value: 'mine', label: 'Mina' }
            ]}
          />
        </div>
      )}
      <CheckinList
        paged={paged}
        onDeleteItem={effective === 'mine' ? () => {} : undefined}
        empty={
          <EmptyState
            icon={IconPlane}
            title={effective === 'mine' ? 'Du har inga check-ins ännu' : 'Inga check-ins ännu'}
          >
            <p className="muted">
              {effective === 'mine'
                ? 'Logga ditt första flygplatsbesök.'
                : 'Bli först med att logga ett flygplatsbesök.'}
            </p>
            <Link to="/checkin" className="btn btn--primary">
              <IconPlus size={18} aria-hidden="true" /> Checka in
            </Link>
          </EmptyState>
        }
      />
    </div>
  );
}
