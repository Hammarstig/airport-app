import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { formatDate } from '../../lib/format.js';
import { useToast } from '../../components/Toast.jsx';
import { EmptyState, ErrorState, Segmented } from '../../components/ui.jsx';
import { SkeletonRows } from '../../components/Skeleton.jsx';
import { IconShield } from '../../assets/icons.jsx';
import NotFoundPage from '../NotFound/NotFoundPage.jsx';

const STATUSES = [
  { value: 'open', label: 'Öppna' },
  { value: 'resolved', label: 'Åtgärdade' },
  { value: 'dismissed', label: 'Avfärdade' }
];
const REASON = {
  spam: 'Spam',
  harassment: 'Trakasserier',
  inappropriate: 'Olämpligt',
  privacy: 'Integritet',
  other: 'Annat'
};

function targetLink(r) {
  if (r.type === 'user') return `/u/${r.target}`;
  if (r.type === 'checkin') return `/c/${r.target}`;
  return null;
}

/** Modereringskö för rapporter (bara för moderatorer). */
export default function ModerationPage() {
  useDocumentTitle('Moderering');
  const { user } = useAuth();
  const toast = useToast();
  const [status, setStatus] = useState('open');
  const { data, loading, error, reload, setData } = useAsync(() => api.moderationReports(status), [status]);
  if (!user?.isModerator) return <NotFoundPage />;

  const act = async (id, action) => {
    try {
      await api.moderate(id, action);
      setData((cur) => cur.filter((r) => r.id !== id));
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <div className="page">
      <header className="page__header">
        <h1 className="page__title">Moderering</h1>
      </header>
      <Segmented name="status" label="Status" options={STATUSES} value={status} onChange={setStatus} />
      <div className="mt-4">
        {loading && !data && <SkeletonRows />}
        {error && <ErrorState error={error} onRetry={reload} />}
        {data && data.length === 0 && <EmptyState icon={IconShield} title="Inga rapporter" />}
        {data && data.length > 0 && (
          <ul className="list">
            {data.map((r) => (
              <li key={r.id} className="list__item">
                <span className="flex-1 min-w-0">
                  <span className="bold block">
                    {REASON[r.reason] || r.reason} · {r.type} {r.reportCount > 1 ? `(${r.reportCount} rapporter)` : ''}
                  </span>
                  <span className="muted text-sm block">
                    {targetLink(r) ? <Link to={targetLink(r)}>{String(r.target)}</Link> : `kommentar ${r.target}`} · av
                    @{r.reporter?.username} · {formatDate(r.createdAt)}
                  </span>
                  {r.note && <span className="block">{r.note}</span>}
                </span>
                {status === 'open' && (
                  <span className="row gap-1">
                    {r.type !== 'user' && (
                      <button
                        type="button"
                        className="btn btn--danger btn--sm"
                        onClick={() => act(r.id, 'remove_content')}
                      >
                        Ta bort
                      </button>
                    )}
                    <button type="button" className="btn btn--sm" onClick={() => act(r.id, 'resolve')}>
                      Åtgärdad
                    </button>
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => act(r.id, 'dismiss')}>
                      Avfärda
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
