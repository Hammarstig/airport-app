import { useEffect, useRef, useState } from 'react';
import { formatDate } from '../lib/format.js';
import { IconBadge } from '../assets/icons.jsx';

// Märkesbilder blir egna filer (se assetsInlineLimit i vite.config.js): bara de bilder som visas laddas.
const ICONS = import.meta.glob(['../assets/badges/*.svg', '../assets/badges/tiers/*.svg'], {
  eager: true,
  import: 'default'
});

export const TIER_LABEL = { bronze: 'Brons', silver: 'Silver', gold: 'Guld', platinum: 'Platina' };

/** Bild för ett märke: nivåbild om den finns, annars grundbilden, annars null. */
export const badgeUrl = (badge) =>
  (badge.tier && ICONS[`../assets/badges/tiers/${badge.id}--${badge.tier}.svg`]) ||
  ICONS[`../assets/badges/${badge.id}.svg`] ||
  null;

export function BadgeIcon({ badge, className }) {
  // Saknas bild visas en generisk ikon i nivåramen (badge-card--<tier>).
  const url = badgeUrl(badge);
  return (
    <span className={className} aria-hidden="true">
      {url ? <img src={url} alt="" width={88} height={88} /> : <IconBadge size={88} />}
    </span>
  );
}

function Progress({ b }) {
  const cur = b.progress?.current ?? 0;
  const target = b.progress?.target ?? 1;
  return (
    <span
      className="badge-card__progress"
      style={{ '--progress': Math.min(1, cur / target) }}
      role="progressbar"
      aria-label={`Framsteg ${b.name}`}
      aria-valuemin={0}
      aria-valuemax={target}
      aria-valuenow={Math.min(cur, target)}
    />
  );
}

const maxed = (b) => b.tiers && b.tierLevel >= b.tiers.length;

function BadgeCard({ b, onOpen }) {
  const locked = !b.tierLevel;
  return (
    <li>
      <button
        type="button"
        className={`badge-card${locked ? ' badge-card--locked' : ` badge-card--${b.tier}`}`}
        aria-label={`${b.name}, ${b.tier ? TIER_LABEL[b.tier] : 'ej upplåst'}`}
        onClick={() => onOpen(b)}
      >
        <BadgeIcon badge={b} className="badge-card__icon" />
        <span className="badge-card__name">{b.name}</span>
        {b.tier && <span className={`tier-chip tier--${b.tier}`}>{TIER_LABEL[b.tier]}</span>}
        <span className="badge-card__desc">{b.description}</span>
        {!maxed(b) && <Progress b={b} />}
        {b.earnedAt && <span className="badge-card__date">{formatDate(b.earnedAt)}</span>}
      </button>
    </li>
  );
}

/** Bottenark med märkets alla nivåer, framsteg och sällsynthet. */
function BadgeDetail({ b, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    ref.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  const cur = b.progress?.current ?? 0;
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="badge-detail-title">
      <div className="modal__backdrop" onClick={onClose} aria-hidden="true" />
      <div className="modal__panel badge-detail">
        <BadgeIcon badge={b} className="badge-detail__icon" />
        <h2 className="modal__title" id="badge-detail-title">
          {b.name}
        </h2>
        <p className="muted">{b.description}</p>
        {b.tiers && (
          <ol className="badge-detail__tiers" aria-label="Nivåer">
            {b.tiers.map((t, i) => (
              <li
                key={t.tier}
                className={`badge-detail__tier badge-detail__tier--${i < b.tierLevel ? 'reached' : 'locked'}`}
              >
                <span className={`tier-chip tier--${t.tier}`}>{TIER_LABEL[t.tier]}</span> {t.target}
                {t.earnedAt ? ` · ${formatDate(t.earnedAt)}` : ''}
              </li>
            ))}
          </ol>
        )}
        {!maxed(b) && (
          <>
            <Progress b={b} />
            <p className="text-sm">
              {Math.min(cur, b.progress.target)} / {b.progress.target}
              {b.tiers?.[b.tierLevel] ? ` till ${TIER_LABEL[b.tiers[b.tierLevel].tier].toLowerCase()}` : ''}
            </p>
          </>
        )}
        {b.rarity != null && (
          <p className="muted text-sm">{String(b.rarity).replace('.', ',')} % av resenärerna har detta märke.</p>
        )}
        <div className="modal__footer">
          <button ref={ref} type="button" className="btn btn--primary btn--block" onClick={onClose}>
            Stäng
          </button>
        </div>
      </div>
    </div>
  );
}

/** Märkesrutnät: upplåsta först (högst nivå), sedan närmast att låsas upp. Tryck öppnar detaljer. */
export function BadgeGrid({ badges }) {
  const [open, setOpen] = useState(null);
  const ratio = (b) => (b.progress ? b.progress.current / Math.max(1, b.progress.target) : 0);
  const sorted = [...badges].sort((a, b) => b.tierLevel - a.tierLevel || ratio(b) - ratio(a));
  return (
    <>
      <ul className="badge-grid">
        {sorted.map((b) => (
          <BadgeCard key={b.id} b={b} onOpen={setOpen} />
        ))}
      </ul>
      {open && <BadgeDetail b={open} onClose={() => setOpen(null)} />}
    </>
  );
}
