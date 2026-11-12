import { useState } from 'react';
import { enablePush, markPushOffered, shouldOfferPush } from '../lib/push.js';
import { useToast } from './Toast.jsx';
import { IconBell } from '../assets/icons.jsx';

/** Erbjudande om push-notiser, visas efter en check-in (aldrig vid start). */
export function PushPrompt() {
  const toast = useToast();
  const [show, setShow] = useState(shouldOfferPush);
  const [busy, setBusy] = useState(false);
  if (!show) return null;

  const yes = async () => {
    setBusy(true);
    try {
      await enablePush();
      toast.show('Notiser är på. Du kan ändra vilka i Inställningar.');
    } catch (e) {
      toast.error(e);
    } finally {
      setShow(false);
    }
  };
  const no = () => {
    markPushOffered();
    setShow(false);
  };

  return (
    <section className="card" aria-labelledby="push-title">
      <div className="card__body stack stack--sm">
        <h2 className="section__title mt-0 mb-0 row items-center gap-2" id="push-title">
          <IconBell size={20} aria-hidden="true" /> Få veta när vänner reagerar
        </h2>
        <p className="muted mt-0 mb-0">
          Notiser när någon gillar eller kommenterar, följer dig eller går om dig på topplistan.
        </p>
        <div className="row">
          <button type="button" className="btn btn--primary btn--sm" onClick={yes} disabled={busy}>
            Slå på notiser
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={no}>
            Inte nu
          </button>
        </div>
      </div>
    </section>
  );
}
