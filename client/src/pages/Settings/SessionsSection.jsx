import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { timeAgo } from '../../lib/format.js';
import { useToast } from '../../components/Toast.jsx';
import { ErrorState } from '../../components/ui.jsx';

function describe(client = '') {
  const os = /Android/.test(client)
    ? 'Android'
    : /iPhone|iPad/.test(client)
      ? 'iOS'
      : /Mac OS/.test(client)
        ? 'Mac'
        : /Windows/.test(client)
          ? 'Windows'
          : /Linux/.test(client)
            ? 'Linux'
            : 'Okänd enhet';
  const br = /Edg\//.test(client)
    ? 'Edge'
    : /Chrome\//.test(client)
      ? 'Chrome'
      : /Firefox\//.test(client)
        ? 'Firefox'
        : /Safari\//.test(client)
          ? 'Safari'
          : '';
  return [br, os].filter(Boolean).join(' på ');
}

/** Inloggade enheter, logga ut en enhet eller alla. */
export function SessionsSection() {
  const toast = useToast();
  const navigate = useNavigate();
  const { clear } = useAuth();
  const { data, error, reload, setData } = useAsync(
    () => api.sessions(),
    [],
    () => api.peek.sessions()
  );

  const revoke = async (id) => {
    try {
      await api.revokeSession(id);
      setData((cur) => cur.filter((s) => s.id !== id));
    } catch (e) {
      toast.error(e);
    }
  };
  const all = async () => {
    if (!window.confirm('Logga ut på alla enheter, även den här?')) return;
    try {
      await api.logoutAll();
    } catch (e) {
      return toast.error(e);
    }
    clear();
    toast.show('Du är utloggad på alla enheter.');
    navigate('/', { replace: true });
  };

  return (
    <div className="stack">
      {error && error.status !== 404 && <ErrorState error={error} onRetry={reload} />}
      {data && data.length > 0 && (
        <ul className="list" aria-label="Inloggade enheter">
          {data.map((s) => (
            <li key={s.id} className="list__item">
              <span className="flex-1 min-w-0">
                <span className="bold block">
                  {describe(s.client)}
                  {s.current ? ' (den här)' : ''}
                </span>
                <span className="muted text-sm">Senast aktiv {timeAgo(s.lastUsedAt || s.createdAt)}</span>
              </span>
              {!s.current && (
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => revoke(s.id)}>
                  Logga ut
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div>
        <button type="button" className="btn btn--sm" onClick={all}>
          Logga ut på alla enheter
        </button>
      </div>
    </div>
  );
}
