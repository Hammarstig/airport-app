import { useState } from 'react';
import { Link } from 'react-router-dom';

/** Tillgänglig lista över landets flygplatser (alternativ till prickarna på kartan). */
export function AirportCoverageList({ airports }) {
  const [showAll, setShowAll] = useState(false);
  const visited = airports.filter((a) => a.visited).sort((a, b) => b.visits - a.visits);
  const other = airports.filter((a) => !a.visited);
  const typeOrder = { large: 0, medium: 1, small: 2 };
  other.sort((a, b) => (typeOrder[a.type] ?? 3) - (typeOrder[b.type] ?? 3) || a.name.localeCompare(b.name, 'sv'));

  const row = (a) => (
    <li key={a.iata} className="list__item">
      <Link to={`/airport/${a.iata}`} className="iata-tag">
        {a.iata}
      </Link>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Link to={`/airport/${a.iata}`} style={{ fontWeight: 600, display: 'block' }}>
          {a.name}
        </Link>
        <span className="muted" style={{ fontSize: '0.85em' }}>
          {a.city}
        </span>
      </div>
      {a.visited ? <span className="badge badge--signal">{a.visits} besök</span> : null}
    </li>
  );

  return (
    <section className="section" aria-labelledby="ap-title">
      <h2 className="section__title" id="ap-title">
        Flygplatser
      </h2>
      {visited.length > 0 ? (
        <ul className="list">{visited.map(row)}</ul>
      ) : (
        <p className="muted">Inga besökta flygplatser här ännu.</p>
      )}
      {other.length > 0 && (
        <>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            aria-expanded={showAll}
            onClick={() => setShowAll((v) => !v)}
            style={{ marginTop: 8 }}
          >
            {showAll ? 'Dölj ej besökta' : `Visa ${other.length} ej besökta`}
          </button>
          {showAll && (
            <ul className="list" style={{ marginTop: 8 }}>
              {other.map(row)}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
