import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useToast } from '../../components/Toast.jsx';
import { TRAVEL_CLASSES } from '../../lib/format.js';
import { AirlineTag } from '../../components/TravelDetails.jsx';
import { Lightbox } from '../../components/Lightbox.jsx';
import { IconBookmark } from '../../assets/icons.jsx';

/** "Vill besöka"-knapp med optimistisk uppdatering. */
export function WishButton({ iata, initial }) {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [on, setOn] = useState(!!initial);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    if (!user) {
      toast.show('Logga in för att använda önskelistan.');
      return navigate('/login', { state: { from: `/airport/${iata}` } });
    }
    if (busy) return;
    setBusy(true);
    const next = !on;
    setOn(next);
    try {
      if (next) await api.addWish(iata);
      else await api.removeWish(iata);
      toast.show(next ? `${iata} tillagd i önskelistan.` : `${iata} borttagen från önskelistan.`);
    } catch (e) {
      setOn(!next);
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button type="button" className={`wish-btn${on ? ' wish-btn--active' : ''}`} aria-pressed={on} onClick={toggle}>
      <IconBookmark size={18} aria-hidden="true" />
      {on ? 'På önskelistan' : 'Vill besöka'}
    </button>
  );
}

export function TopAirlines({ list }) {
  if (!list || list.length === 0) return <p className="muted">Inga flygbolag loggade ännu.</p>;
  return (
    <ol className="list">
      {list.map((r) => (
        <li key={r.airline.iata} className="list__item">
          <AirlineTag airline={r.airline} />
          <span className="spacer" />
          <span className="muted">{r.checkins} check-ins</span>
        </li>
      ))}
    </ol>
  );
}

export function ClassMix({ mix }) {
  const total = mix ? TRAVEL_CLASSES.reduce((n, c) => n + (mix[c.value] || 0), 0) : 0;
  if (!total) return <p className="muted">Ingen reseklass loggad ännu.</p>;
  return (
    <div className="stack">
      {TRAVEL_CLASSES.map((c) => {
        const n = mix[c.value] || 0;
        const pct = Math.round((n / total) * 100);
        return (
          <div className="subrating" key={c.value}>
            <span className="subrating__label">{c.label}</span>
            <span
              className="subrating__bar"
              role="meter"
              aria-label={c.label}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              aria-valuetext={`${pct} procent`}
            >
              <span className="subrating__fill" style={{ '--value': (pct / 100) * 5 }} />
            </span>
            <span className="muted" style={{ minWidth: 40, textAlign: 'right' }}>
              {pct} %
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function PhotoGallery({ photos, iata }) {
  const [idx, setIdx] = useState(null);
  if (!photos || photos.length === 0)
    return <p className="muted">Inga foton ännu. Lägg till foton när du checkar in.</p>;
  return (
    <>
      <div className="gallery">
        {photos.map((p, i) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setIdx(i)}
            aria-label={`Visa foto ${i + 1} av ${photos.length}`}
          >
            <img src={p.url} alt="" loading="lazy" decoding="async" />
          </button>
        ))}
      </div>
      {idx !== null && (
        <Lightbox
          photos={photos.map((p) => ({ ...p, caption: `Foto från ${iata}` }))}
          index={idx}
          onIndex={setIdx}
          onClose={() => setIdx(null)}
        />
      )}
    </>
  );
}
