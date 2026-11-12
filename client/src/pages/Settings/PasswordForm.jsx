import { useState } from 'react';
import { api, setToken } from '../../lib/api.js';
import { useToast } from '../../components/Toast.jsx';

/** Byt lösenord. Övriga sessioner loggas ut av servern; denna får en ny token. */
export function PasswordForm() {
  const toast = useToast();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (next.length < 8) return setError('Det nya lösenordet måste vara minst 8 tecken.');
    setBusy(true);
    try {
      const res = await api.changePassword(cur, next);
      if (res?.token) setToken(res.token);
      setCur('');
      setNext('');
      toast.show('Lösenordet är bytt. Andra enheter har loggats ut.');
    } catch (err) {
      setError(err.status === 403 ? 'Fel nuvarande lösenord.' : err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="stack" onSubmit={submit} aria-label="Byt lösenord">
      <div className="field">
        <label className="field__label" htmlFor="pw-current">
          Nuvarande lösenord
        </label>
        <input
          id="pw-current"
          className="input"
          type="password"
          autoComplete="current-password"
          value={cur}
          onChange={(e) => setCur(e.target.value)}
          required
        />
      </div>
      <div className="field">
        <label className="field__label" htmlFor="pw-new">
          Nytt lösenord
        </label>
        <input
          id="pw-new"
          className="input"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          aria-describedby="pw-hint"
          aria-invalid={error ? true : undefined}
          required
        />
        <span className="field__hint" id="pw-hint">
          Minst 8 tecken, inte ditt användarnamn eller ett vanligt lösenord.
        </span>
        {error && (
          <span className="field__error" role="alert">
            {error}
          </span>
        )}
      </div>
      <div>
        <button type="submit" className="btn btn--sm" disabled={busy || !cur || !next}>
          {busy ? 'Byter...' : 'Byt lösenord'}
        </button>
      </div>
    </form>
  );
}
