import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { load, save } from '../lib/storage.js';
import { Avatar } from './ui.jsx';
import { FollowButton } from './FollowButton.jsx';
import { IconClose } from '../assets/icons.jsx';

const DISMISSED = 'gatelog.dismissedSuggestions';

function reasonText(s) {
  if (s.reason === 'friends' && s.mutualFriends)
    return s.mutualFriends === 1 ? '1 gemensam vän' : `${s.mutualFriends} gemensamma vänner`;
  if (s.reason === 'airports' && s.sharedAirports)
    return s.sharedAirports === 1 ? '1 gemensam flygplats' : `${s.sharedAirports} gemensamma flygplatser`;
  return 'Populär resenär';
}

/** Vänförslag som horisontell rad (.suggest-row). Dolda förslag kommer inte tillbaka på enheten. */
export function Suggestions({ title = 'Förslag till dig', limit = 10 }) {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(() => load(DISMISSED, []));
  const { data } = useAsync(
    () => (user ? api.suggestions(limit) : Promise.resolve([])),
    [user?.username, limit],
    () => api.peek.suggestions(limit)
  );
  const list = (data || []).filter((s) => !dismissed.includes(s.username));
  if (!user || list.length === 0) return null;

  const dismiss = (u) => {
    const next = [...dismissed, u].slice(-200);
    setDismissed(next);
    save(DISMISSED, next);
  };

  return (
    <section className="stack stack--sm" aria-labelledby="sugg-title">
      <h2 className="section__title mt-0 mb-0" id="sugg-title">
        {title}
      </h2>
      <ul className="suggest-row" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {list.map((s) => (
          <li key={s.username} className="suggest-card">
            <Avatar user={s} />
            <Link to={`/u/${s.username}`} className="suggest-card__name">
              {s.displayName || s.username}
            </Link>
            <span className="suggest-card__reason">{reasonText(s)}</span>
            <FollowButton username={s.username} initial={false} small />
            <button
              type="button"
              className="icon-btn suggest-card__dismiss"
              aria-label={`Dölj förslaget ${s.displayName || s.username}`}
              onClick={() => dismiss(s.username)}
            >
              <IconClose size={16} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
