import { Link } from 'react-router-dom';

/** Tabell med namn, besökta/total, procent och mätare. rows: [{code, name, visited, total, pct}] */
export function CoverageTable({ rows, caption, nameHeader = 'Namn', linkTo }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="coverage-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr className="muted" style={{ textAlign: 'left', fontSize: '0.8em' }}>
            <th scope="col" style={{ padding: '6px 8px 6px 0' }}>
              {nameHeader}
            </th>
            <th scope="col" style={{ padding: '6px 8px', textAlign: 'right' }}>
              Besökta
            </th>
            <th scope="col" style={{ padding: '6px 8px', textAlign: 'right' }}>
              %
            </th>
            <th scope="col" style={{ padding: '6px 0 6px 8px', width: '30%' }}>
              <span className="visually-hidden">Mätare</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.code} style={{ borderTop: '1px solid var(--line)' }}>
              <th scope="row" style={{ padding: '8px 8px 8px 0', textAlign: 'left', fontWeight: 600 }}>
                {linkTo ? <Link to={linkTo(r)}>{r.name}</Link> : r.name}
              </th>
              <td style={{ padding: 8, textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                {r.visited} / {r.total}
              </td>
              <td style={{ padding: 8, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {String(r.pct).replace('.', ',')}
              </td>
              <td style={{ padding: '8px 0 8px 8px' }}>
                <div className="coverage-bar" style={{ '--value': Math.min(100, r.pct) }} aria-hidden="true" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
