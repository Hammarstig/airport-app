import { useEffect } from 'react';
import { useOnline } from '../hooks/useOnline.js';
import { useOfflineQueue } from '../hooks/useOfflineQueue.js';
import { onSent, startQueue } from '../lib/offlineQueue.js';
import { useToast } from './Toast.jsx';

/** Smal statusrad under toppfältet: offline och/eller köade check-ins. */
export function OfflineBanner() {
  const online = useOnline();
  const { items, sending } = useOfflineQueue();
  const toast = useToast();
  const waiting = items.filter((i) => !i.error).length;
  const failed = items.length - waiting;

  useEffect(() => {
    startQueue();
    return onSent((n) => toast.show(n === 1 ? 'Din köade check-in är skickad.' : `${n} köade check-ins är skickade.`));
  }, [toast]);

  if (online && !waiting && !failed) return null;
  let text;
  if (!online)
    text = waiting ? `Offline - ${waiting} check-in${waiting === 1 ? '' : 's'} väntar på nät` : 'Du är offline';
  else if (sending) text = 'Skickar köade check-ins...';
  else if (waiting) text = `${waiting} check-in${waiting === 1 ? '' : 's'} väntar på att skickas`;
  else text = `${failed} check-in${failed === 1 ? '' : 's'} kunde inte skickas - se Inställningar`;

  return (
    <div className={`offline-banner${online ? '' : ' offline-banner--offline'}`} role="status" aria-live="polite">
      {text}
    </div>
  );
}
