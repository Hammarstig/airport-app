import { useEffect, useId, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { useToast } from './Toast.jsx';

const REASONS = [
  ['spam', 'Spam eller reklam', 'Upprepade eller kommersiella inlägg'],
  ['harassment', 'Trakasserier', 'Hot, förolämpningar eller förföljelse'],
  ['inappropriate', 'Olämpligt innehåll', 'Stötande text eller bilder'],
  ['privacy', 'Avslöjar privat information', 'Andras resor, adresser eller kontaktuppgifter'],
  ['other', 'Annat', 'Beskriv gärna i kommentaren']
];

const TITLE = { user: 'Rapportera användare', comment: 'Rapportera kommentar', checkin: 'Rapportera check-in' };

/** Bottenark för att rapportera en användare, kommentar eller check-in till moderatorerna. */
export function ReportDialog({ type, target, onClose }) {
  const toast = useToast();
  const id = useId().replace(/:/g, '');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const first = useRef(null);

  useEffect(() => {
    const prev = document.activeElement;
    first.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [onClose]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.report({ type, target, reason, ...(note.trim() ? { note: note.trim() } : {}) });
      toast.show('Tack. Rapporten är skickad till moderatorerna.');
      onClose();
    } catch (err) {
      toast.error(err);
      setBusy(false);
    }
  };

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby={`${id}-t`}>
      <div className="modal__backdrop" onClick={onClose} aria-hidden="true" />
      <form className="modal__panel" onSubmit={submit}>
        <div className="modal__header">
          <h2 className="modal__title" id={`${id}-t`}>
            {TITLE[type]}
          </h2>
        </div>
        <fieldset className="choice-list">
          <legend className="field__label">Vad är fel?</legend>
          {REASONS.map(([v, label, desc], i) => (
            <label key={v} className="choice">
              <input
                ref={i === 0 ? first : undefined}
                type="radio"
                name={`${id}-reason`}
                value={v}
                checked={reason === v}
                onChange={() => setReason(v)}
              />
              <span className="choice__title">{label}</span>
              <span className="choice__desc">{desc}</span>
            </label>
          ))}
        </fieldset>
        <div className="field mt-4">
          <label className="field__label" htmlFor={`${id}-note`}>
            Kommentar (valfritt)
          </label>
          <textarea
            id={`${id}-note`}
            className="textarea"
            rows={2}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <div className="modal__footer">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Avbryt
          </button>
          <button type="submit" className="btn btn--danger" disabled={!reason || busy}>
            {busy ? 'Skickar...' : 'Skicka rapport'}
          </button>
        </div>
      </form>
    </div>
  );
}
