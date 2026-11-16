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

const UserLink = ({ username }) => (username ? <Link to={`/u/${username}`}>@{username}</Link> : 'okänd användare');

/** Vad som rapporterats (API:t ger target som objekt per typ, BUG-13). */
function ReportTarget({ type, target }) {
  const t = target && typeof target === 'object' ? target : { id: target };
  if (type === 'user')
    return (
      <span className="block">
        Användare <UserLink username={t.username} />
        {t.displayName ? ` (${t.displayName})` : ''}
      </span>
    );
  const gone = t.exists === false;
  const text = type === 'comment' ? t.body : t.comment;
  return (
    <span className="block">
      {type === 'checkin' ? (
        gone ? (
          `Check-in ${t.id}`
        ) : (
          <Link to={`/c/${t.id}`}>Check-in{t.iata ? ` på ${t.iata}` : ''}</Link>
        )
      ) : (
        'Kommentar'
      )}{' '}
      av <UserLink username={t.author} />
      {gone && ' (borttagen)'}
      {text && <q className="block mt-1">{text}</q>}
    </span>
  );
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
                  <ReportTarget type={r.type} target={r.target} />
                  <span className="muted text-sm block">
                    Rapporterad av @{typeof r.reporter === 'string' ? r.reporter : r.reporter?.username || 'okänd'} ·{' '}
                    {formatDate(r.createdAt)}
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
