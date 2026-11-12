import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from './Toast.jsx';

/**
 * Följ/avfölj med optimistisk uppdatering. Mot en privat profil blir det en följförfrågan
 * ("Förfrågan skickad"), som kan dras tillbaka med samma knapp.
 * onChange({ following, requested, followers }) efter svar.
 */
export function FollowButton({ username, initial, requested: initialRequested = false, onChange, small = false }) {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [s, setS] = useState({ following: !!initial, requested: !!initialRequested });
  const [busy, setBusy] = useState(false);
  if (user && user.username === username) return null;

  const toggle = async () => {
    if (!user) {
      toast.show('Logga in för att följa resenärer.');
      return navigate('/login', { state: { from: `/u/${username}` } });
    }
    if (busy) return;
    const prev = s;
    const undo = s.following || s.requested;
    setS(undo ? { following: false, requested: false } : { following: true, requested: false });
    setBusy(true);
    try {
      const res = undo ? await api.unfollow(username) : await api.follow(username);
      const next = { following: !!res.following, requested: !!res.requested };
      setS(next);
      if (next.requested) toast.show(`Förfrågan skickad till @${username}.`);
      onChange && onChange({ ...res, ...next });
    } catch (e) {
      setS(prev);
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  const active = s.following || s.requested;
  return (
    <button
      type="button"
      className={`follow-btn${active ? ' follow-btn--active' : ''}${small ? ' follow-btn--sm' : ''}`}
      aria-pressed={active}
      onClick={toggle}
    >
      {s.following ? 'Följer' : s.requested ? 'Förfrågan skickad' : 'Följ'}
    </button>
  );
}
