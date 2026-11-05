import { SUB_RATINGS, formatRating } from '../lib/format.js';

export function SubRatingBars({ averages }) {
  const rows = SUB_RATINGS.filter((s) => averages && averages[s.key] != null);
  if (rows.length === 0) return <p className="muted">Inga delbetyg ännu.</p>;
  return (
    <div className="stack">
      {rows.map((s) => (
        <div className="subrating" key={s.key}>
          <span className="subrating__label">{s.label}</span>
          <span
            className="subrating__bar"
            role="meter"
            aria-label={s.label}
            aria-valuemin={0}
            aria-valuemax={5}
            aria-valuenow={averages[s.key]}
            aria-valuetext={`${formatRating(averages[s.key])} av 5`}
          >
            <span className="subrating__fill" style={{ '--value': averages[s.key] }} />
          </span>
          <span className="muted text-right tabular">{formatRating(averages[s.key])}</span>
        </div>
      ))}
    </div>
  );
}
