import { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../lib/auth.jsx';
import { useToast } from '../../components/Toast.jsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';

import { Field } from './Field.jsx';

export default function LoginPage() {
  useDocumentTitle('Logga in');
  const { user, login } = useAuth();
  const toast = useToast();
  const location = useLocation();
  const from = location.state?.from || '/';
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (user) return <Navigate to={from} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const u = await login(username.trim().toLowerCase(), password);
      toast.show(`Välkommen tillbaka, ${u.displayName || u.username}!`);
    } catch (err) {
      setError(err.message);
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page" style={{ maxWidth: 440 }}>
      <header className="page__header">
        <h1 className="page__title">Logga in</h1>
      </header>
      <form className="card" onSubmit={submit}>
        <div className="card__body stack">
          <Field
            id="login-username"
            label="Användarnamn"
            autoComplete="username"
            autoCapitalize="none"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <Field
            id="login-password"
            label="Lösenord"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={error}
          />
          <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
            {busy ? 'Loggar in...' : 'Logga in'}
          </button>
          <p className="muted mt-0 mb-0 text-center">
            Inget konto?{' '}
            <Link to="/register" state={location.state}>
              Registrera dig
            </Link>
          </p>
        </div>
      </form>
    </div>
  );
}
