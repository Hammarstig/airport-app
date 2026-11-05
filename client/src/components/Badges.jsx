import { useEffect, useRef } from 'react';
import { formatDate } from '../lib/format.js';
import { IconBadge } from '../assets/icons.jsx';

const ICONS = import.meta.glob('../assets/badges/*.svg', { eager: true, import: 'default' });

function iconUrl(badge) {
  // badge.icon är en emoji från API:t; SVG:erna heter som märkets id.
  return ICONS[`../assets/badges/${badge.id}.svg`] || null;
}

export function BadgeIcon({ badge, className }) {
  const url = iconUrl(badge);
  return (
    <span className={className} aria-hidden="true">
      {url ? <img src={url} alt="" width={88} height={88} /> : <IconBadge size={88} />}
    </span>
  );
}

export function BadgeGrid({ badges }) {
  const sorted = [...badges].sort((a, b) => (b.earnedAt ? 1 : 0) - (a.earnedAt ? 1 : 0));
  return (
    <ul className="badge-grid" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {sorted.map((b) => {
        const locked = !b.earnedAt;
        const cur = b.progress?.current ?? 0;
        const target = b.progress?.target ?? 1;
        return (
          <li key={b.id} className={`badge-card${locked ? ' badge-card--locked' : ''}`}>
            <BadgeIcon badge={b} className="badge-card__icon" />
            <span className="badge-card__name">{b.name}</span>
            <span className="badge-card__desc">{b.description}</span>
            {locked ? (
              <>
                <span
                  className="badge-card__progress"
                  style={{ '--progress': Math.min(1, cur / target) }}
                  role="progressbar"
                  aria-label={`Framsteg ${b.name}`}
                  aria-valuemin={0}
                  aria-valuemax={target}
                  aria-valuenow={Math.min(cur, target)}
                />
                <span className="badge-card__desc">
                  {Math.min(cur, target)} / {target}
                </span>
              </>
            ) : (
              <span className="badge-card__date">Upplåst {formatDate(b.earnedAt)}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Modal "Nytt märke!" efter check-in. */
export function BadgeUnlockModal({ badges, onClose }) {
  const btn = useRef(null);
  useEffect(() => {
    btn.current && btn.current.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="badge-modal-title">
      <div className="modal__backdrop" onClick={onClose} />
      <div className="modal__panel" tabIndex={-1}>
        <h2 className="visually-hidden" id="badge-modal-title">
          {badges.length > 1 ? `${badges.length} nya märken` : 'Nytt märke'}
        </h2>
        {badges.map((b) => (
          <div className="badge-unlock" key={b.id}>
            <BadgeIcon badge={b} className="badge-unlock__icon" />
            <div className="badge-unlock__title">Nytt märke!</div>
            <div className="badge-unlock__name">{b.name}</div>
            <p className="badge-unlock__desc">{b.description}</p>
          </div>
        ))}
        <div className="modal__footer">
          <button ref={btn} type="button" className="btn btn--primary btn--block" onClick={onClose}>
            Snyggt!
          </button>
        </div>
      </div>
    </div>
  );
}
