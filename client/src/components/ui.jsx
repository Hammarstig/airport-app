import { Link } from 'react-router-dom';
import { formatRating, hueFor, initials, ratingTone, KIND_LABEL } from '../lib/format.js';
import { IconArrival, IconDeparture, IconTransfer, IconClock, IconPlane } from '../assets/icons.jsx';

export function Stars({ value, large = false, label }) {
  const v = value ?? 0;
  const text = label || (value === null || value === undefined ? 'Inget betyg' : `${formatRating(v)} av 5 stjärnor`);
  return (
    <span
      className={`stars${large ? ' stars--lg' : ''}`}
      style={{ '--value': v }}
      role="img"
      aria-label={text}
      title={text}
    />
  );
}

export function RatingBadge({ value, label }) {
  const tone = ratingTone(value);
  return (
    <span
      className={`rating-badge${tone ? ` rating-badge--${tone}` : ''}`}
      aria-label={label || (value == null ? 'Inget betyg' : `Betyg ${formatRating(value)}`)}
    >
      {formatRating(value)}
    </span>
  );
}

export function Avatar({ user, size }) {
  const name = user?.displayName || user?.username || '?';
  return (
    <span
      className={`avatar${size ? ` avatar--${size}` : ''}`}
      style={{ '--hue': hueFor(user?.username || name) }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

const KIND_ICON = {
  departure: IconDeparture,
  arrival: IconArrival,
  transfer: IconTransfer,
  layover: IconClock
};

export function KindChip({ kind }) {
  const Icon = KIND_ICON[kind] || IconPlane;
  return (
    <span className={`kind-chip kind-chip--${kind}`}>
      <Icon size={14} aria-hidden="true" />
      {KIND_LABEL[kind] || kind}
    </span>
  );
}

export function IataTag({ iata, large = false, link = true }) {
  const cls = `iata-tag${large ? ' iata-tag--lg' : ''}`;
  if (!link) return <span className={cls}>{iata}</span>;
  return (
    <Link to={`/airport/${iata}`} className={cls} aria-label={`Flygplats ${iata}`}>
      {iata}
    </Link>
  );
}

export function Spinner({ label = 'Laddar' }) {
  return (
    <div className="row" style={{ justifyContent: 'center', padding: '24px 0' }} role="status">
      <span className="spinner" aria-hidden="true" />
      <span className="visually-hidden">{label}</span>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children }) {
  return (
    <div className="empty-state">
      {Icon && (
        <span className="empty-state__icon" aria-hidden="true">
          <Icon size={32} />
        </span>
      )}
      {title && <p className="bold mt-0 mb-0">{title}</p>}
      {children}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="empty-state" role="alert">
      <p className="mt-0 mb-0">{error?.message || 'Något gick fel.'}</p>
      {onRetry && (
        <button type="button" className="btn btn--sm" onClick={onRetry}>
          Försök igen
        </button>
      )}
    </div>
  );
}

export function Stat({ value, label }) {
  return (
    <div className="stat">
      <div className="stat__value">{value}</div>
      <div className="stat__label">{label}</div>
    </div>
  );
}

export function Tabs({ tabs, value, onChange, label }) {
  const onKey = (e, i) => {
    let next = null;
    if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
    if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
    if (next !== null) {
      e.preventDefault();
      onChange(tabs[next].value);
      const el = e.currentTarget.parentElement.children[next];
      el && el.focus();
    }
  };
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((t, i) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            id={`tab-${t.value}`}
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            className={`tab${active ? ' tab--active' : ''}`}
            onClick={() => onChange(t.value)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

export function Segmented({ options, value, onChange, label, name }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <label key={o.value} className={`segmented__option${active ? ' segmented__option--active' : ''}`}>
            <input
              type="radio"
              className="visually-hidden"
              name={name}
              value={o.value}
              checked={active}
              onChange={() => onChange(o.value)}
            />
            {o.label}
          </label>
        );
      })}
    </div>
  );
}

/** Statistikrad: alltid tre (eller fyra) kolumner, även på 360 px. items: [[värde, etikett], ...] */
export function StatRow({ items, label }) {
  return (
    <div className="stat-row" role="group" aria-label={label}>
      {items.map(([value, lbl]) => (
        <Stat key={lbl} value={value} label={lbl} />
      ))}
    </div>
  );
}
