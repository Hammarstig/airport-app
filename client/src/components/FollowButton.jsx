import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from './Toast.jsx';

/** Följ/avfölj med optimistisk uppdatering. onChange({ following, followers }) efter svar. */
export function FollowButton({ username, initial, onChange, small = false }) {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [following, setFollowing] = useState(!!initial);
  const [busy, setBusy] = useState(false);
  if (user && user.username === username) return null;

  const toggle = async () => {
    if (!user) {
      toast.show('Logga in för att följa resenärer.');
      return navigate('/login', { state: { from: `/u/${username}` } });
    }
    if (busy) return;
    const next = !following;
    setFollowing(next);
    setBusy(true);
    try {
      const res = next ? await api.follow(username) : await api.unfollow(username);
      setFollowing(res.following);
      onChange && onChange(res);
    } catch (e) {
      setFollowing(!next);
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      className={`follow-btn${following ? ' follow-btn--active' : ''}${small ? ' follow-btn--sm' : ''}`}
      aria-pressed={following}
      onClick={toggle}
    >
      {following ? 'Följer' : 'Följ'}
    </button>
  );
}
