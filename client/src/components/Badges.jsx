import { formatDate } from '../lib/format.js';
import { IconBadge } from '../assets/icons.jsx';

const ICONS = import.meta.glob(['../assets/badges/*.svg', '../assets/badges/tiers/*.svg'], {
  eager: true,
  import: 'default'
});

export const TIER_LABEL = { bronze: 'Brons', silver: 'Silver', gold: 'Guld', platinum: 'Platina' };

export function BadgeIcon({ badge, className }) {
  // Nivåbild om den finns, annars grundbilden; saknas båda visas en generisk ikon i nivåramen (badge-card--<tier>).
  const url =
    (badge.tier && ICONS[`../assets/badges/tiers/${badge.id}--${badge.tier}.svg`]) ||
    ICONS[`../assets/badges/${badge.id}.svg`];
  return (
    <span className={className} aria-hidden="true">
      {url ? <img src={url} alt="" width={88} height={88} /> : <IconBadge size={88} />}
    </span>
  );
}

function BadgeCard({ b }) {
  const locked = !b.tierLevel;
  const cur = b.progress?.current ?? 0;
  const target = b.progress?.target ?? 1;
  const maxed = b.tiers && b.tierLevel >= b.tiers.length;
  return (
    <li className={`badge-card${locked ? ' badge-card--locked' : ` badge-card--${b.tier}`}`}>
      <BadgeIcon badge={b} className="badge-card__icon" />
      <span className="badge-card__name">{b.name}</span>
      {b.tier && <span className={`tier-chip tier--${b.tier}`}>{TIER_LABEL[b.tier]}</span>}
      <span className="badge-card__desc">{b.description}</span>
      {!maxed && (
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
            {b.tiers && b.tiers[b.tierLevel] ? ` till ${TIER_LABEL[b.tiers[b.tierLevel].tier].toLowerCase()}` : ''}
          </span>
        </>
      )}
      {b.earnedAt && <span className="badge-card__date">{formatDate(b.earnedAt)}</span>}
      {b.rarity != null && <span className="badge-card__desc">{String(b.rarity).replace('.', ',')} % har detta</span>}
    </li>
  );
}

/** Märkesrutnät: upplåsta först (högst nivå), sedan närmast att låsas upp. */
export function BadgeGrid({ badges }) {
  const ratio = (b) => (b.progress ? b.progress.current / Math.max(1, b.progress.target) : 0);
  const sorted = [...badges].sort((a, b) => b.tierLevel - a.tierLevel || ratio(b) - ratio(a));
  return (
    <ul className="badge-grid">
      {sorted.map((b) => (
        <BadgeCard key={b.id} b={b} />
      ))}
    </ul>
  );
}
