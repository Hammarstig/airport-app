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
