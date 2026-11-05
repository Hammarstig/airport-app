import { useState } from 'react';
import { api } from '../lib/api.js';
import { useToast } from './Toast.jsx';
import { todayIso } from '../lib/format.js';
import { StarsInput } from './StarsInput.jsx';

export function AddLoungeForm({ iata, onAdded, onCancel }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [terminal, setTerminal] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return setError('Ange loungens namn.');
    setSaving(true);
    try {
      const l = await api.addLounge(iata, {
        name: name.trim(),
        ...(terminal.trim() ? { terminal: terminal.trim() } : {})
      });
      toast.show(`${l.name} tillagd.`);
      onAdded(l);
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="card" onSubmit={submit} noValidate aria-label="Lägg till lounge">
      <div className="card__body stack">
        <div className="field">
          <label className="field__label" htmlFor="lounge-name">
            Loungens namn
          </label>
          <input
            id="lounge-name"
            className="input"
            value={name}
            maxLength={100}
            autoFocus
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            aria-invalid={error ? true : undefined}
          />
          {error && <div className="field__error">{error}</div>}
        </div>
        <div className="field">
          <label className="field__label" htmlFor="lounge-terminal">
            Terminal (valfritt)
          </label>
          <input
            id="lounge-terminal"
            className="input"
            value={terminal}
            maxLength={40}
            onChange={(e) => setTerminal(e.target.value)}
          />
        </div>
        <div className="row">
          <button type="submit" className="btn btn--primary btn--sm" disabled={saving}>
            {saving ? 'Sparar...' : 'Lägg till'}
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel}>
            Avbryt
          </button>
        </div>
      </div>
    </form>
  );
}

export function ReviewForm({ lounge, onSaved, onCancel }) {
  const toast = useToast();
  const [rating, setRating] = useState(null);
  const [comment, setComment] = useState('');
  const [visitedOn, setVisitedOn] = useState(todayIso());
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const today = todayIso();
  const base = `rev-${lounge.id}`;

  const submit = async (e) => {
    e.preventDefault();
    if (!rating) return setError('Välj ett betyg.');
    if (visitedOn > today) return setError('Datumet kan inte vara i framtiden.');
    setSaving(true);
    try {
      const r = await api.reviewLounge(lounge.id, {
        rating,
        visitedOn,
        ...(comment.trim() ? { comment: comment.trim() } : {})
      });
      toast.show('Tack för din recension!');
      onSaved(r);
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="stack mt-2" onSubmit={submit} noValidate aria-label={`Recensera ${lounge.name}`}>
      <div className="field">
        <span className="field__label">Betyg</span>
        <StarsInput
          value={rating}
          onChange={(v) => {
            setRating(v);
            setError(null);
          }}
          label={`Betyg för ${lounge.name}`}
        />
      </div>
      <div className="field">
        <label className="field__label" htmlFor={`${base}-date`}>
          Besöksdatum
        </label>
        <input
          id={`${base}-date`}
          className="input"
          type="date"
          max={today}
          value={visitedOn}
          onChange={(e) => setVisitedOn(e.target.value)}
        />
      </div>
      <div className="field">
        <label className="field__label" htmlFor={`${base}-comment`}>
          Kommentar (valfritt)
        </label>
        <textarea
          id={`${base}-comment`}
          className="textarea"
          rows={3}
          maxLength={1000}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
        <div className="field__hint">{comment.length} / 1000 tecken</div>
      </div>
      {error && (
        <div className="field__error" role="alert">
          {error}
        </div>
      )}
      <div className="row">
        <button type="submit" className="btn btn--primary btn--sm" disabled={saving}>
          {saving ? 'Sparar...' : 'Skicka recension'}
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel}>
          Avbryt
        </button>
      </div>
    </form>
  );
}
