import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { loadRecent } from '../../lib/localAirports.js';
import { isNetworkError } from '../../lib/offlineQueue.js';
import { IconClock, IconNearby } from '../../assets/icons.jsx';

const fmtKm = (km) => (km < 10 ? `${km.toFixed(1).replace('.', ',')} km` : `${Math.round(km)} km`);

function Choice({ airport, meta, onPick }) {
  return (
    <li>
      <button type="button" className="quick-pick__item" onClick={() => onPick(airport)}>
        <span className="iata-tag">{airport.iata}</span>
        <span className="quick-pick__text">
          <span className="quick-pick__name">{airport.name}</span>
          <span className="quick-pick__meta">{meta || airport.city}</span>
        </span>
      </button>
    </li>
  );
}

/** Läser geolokalisering om användaren redan har tillåtit den; annars först efter knapptryck. */
function useNearby() {
  const [state, setState] = useState({ status: 'idle', items: [], error: null });

  const locate = () => {
    if (!('geolocation' in navigator)) {
      setState({ status: 'error', items: [], error: 'Platstjänster stöds inte i den här webbläsaren.' });
      return;
    }
    setState((s) => ({ ...s, status: 'loading', error: null }));
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const items = await api.nearbyAirports(pos.coords.latitude, pos.coords.longitude, 6);
          setState({ status: 'done', items: items || [], error: null });
        } catch (e) {
          setState({ status: 'error', items: [], error: e.message });
        }
      },
      (err) =>
        setState({
          status: 'error',
          items: [],
          error:
            err.code === 1
              ? 'Du har nekat platsåtkomst. Sök i stället, eller tillåt plats i webbläsaren.'
              : 'Kunde inte hitta din position.'
        }),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 }
    );
  };

  useEffect(() => {
    if (!navigator.permissions?.query) return;
    navigator.permissions
      .query({ name: 'geolocation' })
      .then((p) => p.state === 'granted' && locate())
      .catch(() => {
        /* Permissions API saknas för geolocation i vissa webbläsare - användaren får trycka på knappen */
      });
  }, []);

  return { ...state, locate };
}

function useRecent() {
  const [items, setItems] = useState(() => api.peek.recentAirports(6) || (navigator.onLine ? null : loadRecent()));
  const [error, setError] = useState(null);
  useEffect(() => {
    let live = true;
    api
      .recentAirports(6)
      .then((rows) => live && setItems(rows || []))
      .catch((e) => {
        if (!live) return;
        // Utan nät: senaste flygplatser som sparats lokalt vid förra hämtningen (BUG-10).
        const local = isNetworkError(e) ? loadRecent() : null;
        if (local) return setItems((cur) => cur || local);
        setError(e.message);
        setItems((cur) => cur || []);
      });
    return () => {
      live = false;
    };
  }, []);
  return { loading: items === null, rows: items || [], error };
}

/** Snabbval överst i check-in: "Nära dig" och "Senaste". Ett tryck väljer flygplats. */
export function QuickPick({ onPick }) {
  const near = useNearby();
  const recent = useRecent();

  return (
    <div className="quick-pick stack">
      <section aria-labelledby="qp-near">
        <h2 className="quick-pick__title" id="qp-near">
          <IconNearby size={16} aria-hidden="true" /> Nära dig
        </h2>
        {near.status === 'idle' && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={near.locate}>
            Visa flygplatser nära mig
          </button>
        )}
        {near.status === 'loading' && (
          <p className="muted" role="status">
            Letar efter flygplatser nära dig...
          </p>
        )}
        {near.status === 'error' && <p className="muted">{near.error}</p>}
        {near.status === 'done' && near.items.length === 0 && <p className="muted">Inga flygplatser i närheten.</p>}
        {near.items.length > 0 && (
          <ul className="quick-pick__list">
            {near.items.map((a) => (
              <Choice
                key={a.iata}
                airport={a}
                meta={`${a.city ? `${a.city} · ` : ''}${fmtKm(a.distanceKm)}`}
                onPick={onPick}
              />
            ))}
          </ul>
        )}
      </section>

      {(recent.rows.length > 0 || recent.loading || recent.error) && (
        <section aria-labelledby="qp-recent">
          <h2 className="quick-pick__title" id="qp-recent">
            <IconClock size={16} aria-hidden="true" /> Senaste
          </h2>
          {recent.error && !recent.rows.length && <p className="muted">{recent.error}</p>}
          {recent.loading ? (
            <p className="muted" role="status">
              Laddar...
            </p>
          ) : (
            <ul className="quick-pick__list">
              {recent.rows.map((r) => (
                <Choice
                  key={r.airport.iata}
                  airport={r.airport}
                  meta={
                    r.isHome ? 'Hemmaflygplats' : `${r.airport.city ? `${r.airport.city} · ` : ''}${r.visits} besök`
                  }
                  onPick={onPick}
                />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
