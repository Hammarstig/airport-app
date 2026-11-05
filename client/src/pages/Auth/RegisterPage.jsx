import { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../lib/auth.jsx';
import { useToast } from '../../components/Toast.jsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { AirportAutocomplete } from '../../components/AirportAutocomplete.jsx';

import { Field } from './Field.jsx';

export default function RegisterPage() {
  useDocumentTitle('Registrera');
  const { user, register } = useAuth();
  const toast = useToast();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [home, setHome] = useState(null);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  // Omdirigering sker här när user sätts, så att det bara finns en navigering.
  if (user) return <Navigate to={location.state?.from || '/checkin'} replace />;

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    const u = username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(u)) errs.username = '3-20 tecken: a-z, 0-9 eller _.';
    if (password.length < 8) errs.password = 'Minst 8 tecken.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const created = await register({
        username: u,
        password,
        ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
        ...(home ? { homeIata: home.iata } : {})
      });
      toast.show(`Välkommen till Gatelog, ${created.displayName || created.username}!`);
    } catch (err) {
      if (err.status === 409) setErrors({ username: err.message || 'Användarnamnet är upptaget.' });
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page" style={{ maxWidth: 440 }}>
      <header className="page__header">
        <h1 className="page__title">Skapa konto</h1>
        <p className="page__subtitle">Börja logga dina flygplatser.</p>
      </header>
      <form className="card" onSubmit={submit} noValidate>
        <div className="card__body stack">
          <Field
            id="reg-username"
            label="Användarnamn"
            hint="3-20 tecken: a-z, 0-9 eller _."
            autoComplete="username"
            autoCapitalize="none"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            error={errors.username}
          />
          <Field
            id="reg-display"
            label="Visningsnamn (valfritt)"
            autoComplete="name"
            value={displayName}
            maxLength={50}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <Field
            id="reg-password"
            label="Lösenord"
            type="password"
            hint="Minst 8 tecken."
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
          />
          <AirportAutocomplete label="Hemmaflygplats (valfritt)" value={home} onSelect={setHome} />
          <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
            {busy ? 'Skapar konto...' : 'Skapa konto'}
          </button>
          <p className="muted" style={{ margin: 0, textAlign: 'center' }}>
            Har du redan ett konto?{' '}
            <Link to="/login" state={location.state}>
              Logga in
            </Link>
          </p>
        </div>
      </form>
    </div>
  );
}
