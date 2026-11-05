import { Link } from 'react-router-dom';
import { Avatar } from '../../components/ui.jsx';

/** Pall för topp 3. Platsklassen följer positionen i listan (CSS ordnar 2-1-3); siffran visar faktisk rank vid delad placering. */
export function Podium({ items, unit, meUsername }) {
  const top = items.slice(0, 3);
  if (top.length < 3) return null;
  return (
    <ol className="podium" aria-label="Topp 3">
      {top.map((r, i) => (
        <li
          key={r.user.username}
          className={`podium__place podium__place--${i + 1}${r.user.username === meUsername ? ' podium__place--me' : ''}`}
          aria-current={r.user.username === meUsername ? 'true' : undefined}
        >
          <Link to={`/u/${r.user.username}`} className="podium__avatar">
            <Avatar user={r.user} size={r.rank === 1 ? 'lg' : undefined} />
          </Link>
          <Link to={`/u/${r.user.username}`} className="podium__name">
            {r.user.displayName || r.user.username}
          </Link>
          <span className="podium__value">
            <strong>{r.value}</strong> {unit}
          </span>
          <span className="podium__block" aria-label={`Plats ${r.rank}`}>
            {r.rank}
          </span>
        </li>
      ))}
    </ol>
  );
}
