import { Link } from 'react-router-dom';
import { Avatar } from './ui.jsx';
import { LevelPill } from './Level.jsx';
import { FollowButton } from './FollowButton.jsx';

/** Rad för en användare med valfri följ-knapp och extra innehåll till höger. */
export function UserRow({ user, meta, right, follow = false }) {
  return (
    <li className="list__item user-row">
      <Avatar user={user} />
      <Link to={`/u/${user.username}`} className="user-row__main">
        <span className="user-row__name">
          {user.displayName || user.username} <LevelPill level={user.level} />
        </span>
        <span className="user-row__meta">
          @{user.username}
          {user.homeIata ? ` · ${user.homeIata}` : ''}
          {meta ? ` · ${meta}` : ''}
        </span>
      </Link>
      {right}
      {follow && <FollowButton username={user.username} initial={user.followedByMe} small />}
    </li>
  );
}
