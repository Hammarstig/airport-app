import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../lib/auth.jsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { KIND_LABEL, formatDate } from '../../lib/format.js';
import { BadgeIcon, TIER_LABEL } from '../../components/Badges.jsx';
import { LevelBar, StreakChip } from '../../components/Level.jsx';
import { ShareButton } from '../../components/ShareButton.jsx';
import { StatRow } from '../../components/ui.jsx';
import { IconTransfer } from '../../assets/icons.jsx';

const ordinal = (n) => `${n}:${[1, 2].includes(n % 10) && ![11, 12].includes(n % 100) ? 'a' : 'e'}`;

function Milestones({ m }) {
  const rows = [];
  if (m.isNewAirport) rows.push(`Ny flygplats - din ${ordinal(m.uniqueAirports)}`);
  if (m.isNewCountry) rows.push(`Nytt land - ditt ${ordinal(m.countries)}`);
  if (m.isNewContinent) rows.push(`Ny kontinent - din ${ordinal(m.continents)}`);
  return (
    <div className="checkin-done__next">
      {rows.length > 0 && (
        <ul className="stack stack--sm">
          {rows.map((r) => (
            <li key={r}>
              <strong>{r}</strong>
            </li>
          ))}
        </ul>
      )}
      <StatRow
        label="Din statistik"
        items={[
          [m.uniqueAirports, 'Flygplatser'],
          [m.countries, 'Länder'],
          [`${String(m.worldPct).replace('.', ',')} %`, 'av världen']
        ]}
      />
    </div>
  );
}

/** Sammanfattning efter check-in: XP, nivå, milstolpar, streak, nya märken, dela och anslutning. */
export default function DonePage() {
  useDocumentTitle('Incheckad');
  const { state } = useLocation();
  const { user } = useAuth();
  if (!state) return <Navigate to="/" replace />;

  if (state.queued) {
    return (
      <div className="page checkin-done">
        <div className="checkin-done__stamp" aria-hidden="true">
          <span className="checkin-done__stamp-kind">Väntar</span>
          <span className="checkin-done__stamp-code">{state.airport.iata}</span>
          <span className="checkin-done__stamp-date">{formatDate(state.visitedOn)}</span>
        </div>
        <h1 className="checkin-done__title">Sparad offline</h1>
        <p className="checkin-done__subtitle">
          Din check-in på {state.airport.iata} ({formatDate(state.visitedOn)}) skickas automatiskt när du har nät igen.
        </p>
        <div className="checkin-done__actions">
          <Link to="/" className="btn btn--primary btn--block">
            Till flödet
          </Link>
        </div>
      </div>
    );
  }

  const c = state.result;
  const ap = c.airport;
  const next = `/checkin?date=${c.visitedOn}&kind=transfer`;
  const badges = c.newBadges || [];

  return (
    <div className="page checkin-done">
      <div className="checkin-done__stamp" aria-hidden="true">
        <span className="checkin-done__stamp-kind">{KIND_LABEL[c.kind]}</span>
        <span className="checkin-done__stamp-code">{ap.iata}</span>
        <span className="checkin-done__stamp-date">{formatDate(c.visitedOn)}</span>
      </div>
      <h1 className="checkin-done__title">Incheckad på {ap.iata}</h1>
      <p className="checkin-done__subtitle">{ap.name}</p>
      {c.xpGained != null && (
        <p className="checkin-done__xp" role="status">
          +{c.xpGained} XP{c.levelUp ? ` - du nådde nivå ${c.levelInfo.level}!` : ''}
        </p>
      )}

      <div className="checkin-done__panel">
        <LevelBar info={c.levelInfo} compact />
        {c.milestones && <StreakChip streak={c.milestones.streak} />}
        {c.milestones && <Milestones m={c.milestones} />}
      </div>

      {badges.length > 0 && (
        <ul className="checkin-done__badges" aria-label="Nya märken">
          {badges.map((b) => (
            <li key={b.id} className="checkin-done__badge">
              <BadgeIcon badge={b} className="badge-card__icon" />
              <span>
                {b.tierLevel > 1 ? 'Ny nivå: ' : 'Nytt märke: '}
                <strong>{b.name}</strong> {b.tier ? TIER_LABEL[b.tier] : ''}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="checkin-done__actions">
        <ShareButton
          className="btn btn--primary btn--block"
          label="Dela check-in"
          getData={() => ({
            title: `Incheckad på ${ap.iata}`,
            text: `Jag checkade in på ${ap.name} (${ap.iata}) på Gatelog${c.rating ? ` och gav ${String(c.rating).replace('.', ',')} av 5` : ''}.`,
            url: `/c/${c.id}`
          })}
        />
        <Link to={next} className="btn btn--block">
          <IconTransfer size={18} aria-hidden="true" /> Lägg till anslutning
        </Link>
        <Link to="/" className="btn btn--ghost btn--block">
          Klar
        </Link>
        <p className="text-center text-sm">
          <Link to={`/airport/${ap.iata}`}>Visa {ap.iata}</Link> · <Link to={`/u/${user.username}`}>Min profil</Link>
        </p>
      </div>
    </div>
  );
}
