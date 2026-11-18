import { useState } from 'react';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAsync } from '../../hooks/useAsync.js';
import { Avatar } from '../../components/ui.jsx';
import { useAuth } from '../../lib/auth.jsx';
import { useToast } from '../../components/Toast.jsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { AirportAutocomplete } from '../../components/AirportAutocomplete.jsx';

import { Field } from './Field.jsx';
import { PRIVACY_DEFAULTS, PrivacyFields, privacySummary } from '../Settings/PrivacySection.jsx';

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
  const [privacy, setPrivacy] = useState(PRIVACY_DEFAULTS);
  const [params] = useSearchParams();
  const ref = (params.get('ref') || '').toUpperCase();
  // Inbjudan: visa vem som bjöd in. Ogiltig kod ignoreras (som i API:t).
  const { data: invite } = useAsync(() => (ref ? api.invite(ref).catch(() => null) : Promise.resolve(null)), [ref]);

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
        ...(home ? { homeIata: home.iata } : {}),
        ...(invite ? { ref: invite.code } : {}),
        privacy
      });
      toast.show(
        `Välkommen till Gatelog, ${created.displayName || created.username}!${
          invite ? ` Du och @${invite.inviter.username} följer nu varandra.` : ''
        }`
      );
    } catch (err) {
      if (err.status === 409) setErrors({ username: err.message || 'Användarnamnet är upptaget.' });
      else if (err.status === 400 && /password|lösenord/i.test(err.message || '')) {
        // Servern stoppar vanliga och läckta lösenord (SEC-12).
        setErrors({ password: 'Lösenordet är för vanligt eller lätt att gissa. Välj ett annat.' });
        return;
      }
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
      {invite && (
        <div className="notice row mb-4" role="status">
          <Avatar user={invite.inviter} />
          <span>
            <strong>{invite.inviter.displayName || `@${invite.inviter.username}`}</strong> har bjudit in dig. Ni följer
            varandra direkt när du skapat kontot.
          </span>
        </div>
      )}
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
          <details className="field">
            <summary>
              <span className="field__label">Integritet</span>{' '}
              <span className="muted" id="reg-privacy-summary">
                {privacySummary(privacy)}
              </span>{' '}
              <span style={{ color: 'var(--info)', textDecoration: 'underline' }}>Ändra</span>
            </summary>
            <div className="mt-2">
              <PrivacyFields value={privacy} onChange={(p) => setPrivacy((cur) => ({ ...cur, ...p }))} compact />
            </div>
          </details>
          <p className="muted text-sm mt-0 mb-0">
            Du kan ändra valen när som helst under Inställningar. Läs hur vi hanterar dina uppgifter i{' '}
            <Link to="/privacy" target="_blank">
              integritetspolicyn
            </Link>
            .
          </p>
          <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
            {busy ? 'Skapar konto...' : 'Skapa konto'}
          </button>
          <p className="muted mt-0 mb-0 text-center">
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
