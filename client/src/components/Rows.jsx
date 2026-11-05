import { Link } from 'react-router-dom';
import { formatRating, placeLine } from '../lib/format.js';
import { IataTag, RatingBadge } from './ui.jsx';
import { IconLounge } from '../assets/icons.jsx';

export function Rank({ n }) {
  return <span className={`rank${n <= 3 ? ` rank--${n}` : ''}`}>{n}</span>;
}

/** Rad för en flygplats: rank (valfri), IATA-tag, namn, plats, metadata, betygsbricka. */
export function AirportRow({ airport, rank, avgRating, ratingCount, checkins, extra }) {
  const meta = [placeLine(airport) || airport.countryName];
  if (extra) meta.push(extra);
  const counts = [];
  if (checkins != null) counts.push(`${checkins} check-ins`);
  if (ratingCount != null) counts.push(`${ratingCount} betyg`);
  return (
    <li className="result-row">
      <span className="result-row__code row row--nowrap" style={{ gap: 8 }}>
        {rank != null && <Rank n={rank} />}
        <IataTag iata={airport.iata} />
      </span>
      <Link to={`/airport/${airport.iata}`} className="result-row__main">
        {airport.name}
      </Link>
      <span className="result-row__meta">{meta.filter(Boolean).join(' · ')}</span>
      <span className="result-row__score">
        <RatingBadge
          value={avgRating}
          label={avgRating == null ? 'Inget betyg' : `Snittbetyg ${formatRating(avgRating)}`}
        />
        {counts.length > 0 && <span>{counts.join(' · ')}</span>}
      </span>
    </li>
  );
}

export function LoungeRow({ lounge, airport, rank, avgRating, reviewCount }) {
  const ap = airport || lounge.airport;
  const avg = avgRating !== undefined ? avgRating : lounge.avgRating;
  const cnt = reviewCount !== undefined ? reviewCount : lounge.reviewCount;
  return (
    <li className="list__item">
      {rank != null && <Rank n={rank} />}
      <IconLounge size={20} aria-hidden="true" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <Link to={`/lounge/${lounge.id}`} style={{ fontWeight: 600, display: 'block' }}>
          {lounge.name}
        </Link>
        <span className="muted" style={{ fontSize: '0.85em' }}>
          {ap ? (
            <>
              <Link to={`/airport/${ap.iata}`}>{ap.iata}</Link> {ap.city ? `${ap.city} · ` : ''}
            </>
          ) : null}
          {lounge.terminal ? `Terminal ${lounge.terminal} · ` : ''}
          {cnt ?? 0} {cnt === 1 ? 'recension' : 'recensioner'}
        </span>
      </div>
      <RatingBadge value={avg} />
    </li>
  );
}
