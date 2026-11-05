import { discard, flush } from '../lib/offlineQueue.js';
import { useOfflineQueue } from '../hooks/useOfflineQueue.js';
import { useOnline } from '../hooks/useOnline.js';
import { formatDate } from '../lib/format.js';

/** Visar köade check-ins (offline) med status. showEmpty visar även text när kön är tom. */
export function OfflineQueueStatus({ showEmpty = false }) {
  const { items, sending } = useOfflineQueue();
  const online = useOnline();
  if (!items.length) {
    return showEmpty ? (
      <p className="muted mt-0 mb-0">
        Check-ins som görs utan nät sparas på enheten och skickas automatiskt. Inget väntar just nu.
      </p>
    ) : null;
  }
  const waiting = items.filter((i) => !i.error).length;
  return (
    <div className="card offline-queue" role="status" aria-live="polite">
      <div className="card__body stack stack--sm">
        <strong>
          {sending
            ? 'Skickar köade check-ins...'
            : waiting
              ? `${waiting} check-in${waiting === 1 ? '' : 's'} väntar på nät`
              : 'Check-ins som inte kunde skickas'}
        </strong>
        {!online && waiting > 0 && (
          <span className="muted">Du är offline. De skickas automatiskt när nätet är tillbaka.</span>
        )}
        <ul className="list">
          {items.map((i) => (
            <li key={i.id} className="list__item">
              <span className="iata-tag">{i.body.iata}</span>
              <span className="flex-1 min-w-0">
                <span className="muted text-sm">
                  {formatDate(i.body.visitedOn)}
                  {i.photos?.length ? ` · ${i.photos.length} foto` : ''}
                </span>
                {i.error && <span className="field__error">{i.error}</span>}
              </span>
              {i.error && (
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => discard(i.id)}>
                  Ta bort
                </button>
              )}
            </li>
          ))}
        </ul>
        {online && waiting > 0 && !sending && (
          <button type="button" className="btn btn--sm" onClick={() => flush()}>
            Skicka nu
          </button>
        )}
      </div>
    </div>
  );
}
