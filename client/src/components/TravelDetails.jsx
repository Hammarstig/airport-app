import { Link } from 'react-router-dom';
import { CLASS_LABEL } from '../lib/format.js';
import { IconSeat } from '../assets/icons.jsx';

export function AirlineTag({ airline }) {
  if (!airline) return null;
  return (
    <span className="airline-tag">
      <span className="airline-tag__code">{airline.iata}</span>
      <span className="airline-tag__name">{airline.name}</span>
    </span>
  );
}

export function ClassChip({ travelClass }) {
  if (!travelClass) return null;
  return (
    <span className={`class-chip class-chip--${travelClass}`}>
      <IconSeat aria-hidden="true" />
      {CLASS_LABEL[travelClass] || travelClass}
    </span>
  );
}

/** Resedetaljer som på ett boardingkort. Renderar inget om inga detaljer finns. */
export function TravelDetailList({ checkin: c }) {
  if (!c.airline && !c.travelClass && !c.lounge && !c.flightNumber) return null;
  return (
    <dl className="detail-list">
      {c.airline && (
        <div>
          <dt>Flygbolag</dt>
          <dd>
            <AirlineTag airline={c.airline} />
          </dd>
        </div>
      )}
      {c.flightNumber && (
        <div>
          <dt>Flight</dt>
          <dd className="detail-list__mono">{c.flightNumber}</dd>
        </div>
      )}
      {c.travelClass && (
        <div>
          <dt>Klass</dt>
          <dd>
            <ClassChip travelClass={c.travelClass} />
          </dd>
        </div>
      )}
      {c.lounge && (
        <div>
          <dt>Lounge</dt>
          <dd>
            <Link to={`/lounge/${c.lounge.id}`}>{c.lounge.name}</Link>
            {c.lounge.terminal ? ` (T${c.lounge.terminal})` : ''}
          </dd>
        </div>
      )}
    </dl>
  );
}
