import { forwardRef } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from '../../components/ui.jsx';
import { LevelPill } from '../../components/Level.jsx';

export function Change({ change }) {
  if (change == null) return null;
  if (change === 0)
    return (
      <span className="rank-delta rank-delta--same" aria-label="Oförändrad placering">
        0
      </span>
    );
  const up = change > 0;
  return (
    <span
      className={`rank-delta rank-delta--${up ? 'up' : 'down'}`}
      aria-label={`${up ? 'Upp' : 'Ned'} ${Math.abs(change)} placeringar`}
    >
      {Math.abs(change)}
    </span>
  );
}

export const RankRow = forwardRef(function RankRow({ row, unit, me, pinned = false }, ref) {
  return (
    <li
      ref={ref}
      className={`list__item user-row${me ? ' list__item--me' : ''}${pinned ? ' list__item--pinned' : ''}`}
      aria-current={me ? 'true' : undefined}
    >
      <span className={`rank${row.rank <= 3 ? ` rank--${row.rank}` : ''}`}>{row.rank}</span>
      <Avatar user={row.user} size="sm" />
      <Link to={`/u/${row.user.username}`} className="user-row__main">
        <span className="user-row__name">
          {row.user.displayName || row.user.username}
          {me ? ' (du)' : ''} <LevelPill level={row.user.level} />
        </span>
        <span className="user-row__meta">
          @{row.user.username}
          {row.user.homeIata ? ` · ${row.user.homeIata}` : ''}
        </span>
      </Link>
      <Change change={row.change} />
      <span className="tabular nowrap">
        <strong>{row.value}</strong> <span className="muted text-sm">{unit}</span>
      </span>
    </li>
  );
});
