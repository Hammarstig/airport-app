import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useToast } from '../../components/Toast.jsx';

/** Radera konto: kräver lösenordet. */
export function DangerZone() {
  const { logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const remove = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.deleteMe(password);
      logout();
      toast.show('Ditt konto och alla dina check-ins är raderade.');
      navigate('/', { replace: true });
    } catch (err) {
      toast.error(err.status === 401 ? 'Fel lösenord.' : err);
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button type="button" className="btn btn--ghost btn--danger btn--sm" onClick={() => setOpen(true)}>
        Radera konto
      </button>
    );
  }
  return (
    <form className="stack" onSubmit={remove} aria-label="Radera konto">
      <p className="mt-0 mb-0">
        Allt raderas permanent: check-ins, foton, recensioner, följare och märken. Det går inte att ångra.
      </p>
      <div className="field">
        <label className="field__label" htmlFor="confirm-delete">
          Bekräfta med ditt lösenord
        </label>
        <input
          id="confirm-delete"
          className="input"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <div className="row">
        <button type="submit" className="btn btn--danger btn--sm" disabled={busy || !password}>
          {busy ? 'Raderar...' : 'Radera mitt konto'}
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpen(false)}>
          Avbryt
        </button>
      </div>
    </form>
  );
}
