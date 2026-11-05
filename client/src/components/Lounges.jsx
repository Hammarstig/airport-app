import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from './Toast.jsx';
import { formatDate } from '../lib/format.js';
import { Avatar, EmptyState, RatingBadge, Stars } from './ui.jsx';
import { AddLoungeForm, ReviewForm } from './LoungeForms.jsx';
import { IconLounge, IconPlus } from '../assets/icons.jsx';

function LoungeItem({ lounge, onChange }) {
  const { user } = useAuth();
  const toast = useToast();
  const [mode, setMode] = useState(null); // 'review' | 'reviews'
  const [reviews, setReviews] = useState(null);

  const showReviews = async () => {
    if (mode === 'reviews') return setMode(null);
    setMode('reviews');
    try {
      const l = await api.lounge(lounge.id);
      setReviews(l.reviews || []);
      onChange({ ...lounge, avgRating: l.avgRating, reviewCount: l.reviewCount });
    } catch (e) {
      toast.error(e);
      setMode(null);
    }
  };

  const onSaved = async () => {
    setMode(null);
    try {
      const l = await api.lounge(lounge.id);
      onChange({ ...lounge, avgRating: l.avgRating, reviewCount: l.reviewCount });
      setReviews(l.reviews || []);
    } catch {
      /* listan uppdateras vid nästa laddning */
    }
  };

  return (
    <li className="list__item" style={{ display: 'block' }}>
      <div className="row" style={{ alignItems: 'center' }}>
        <IconLounge size={20} aria-hidden="true" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Link to={`/lounge/${lounge.id}`} style={{ fontWeight: 600, display: 'block' }}>
            {lounge.name}
          </Link>
          <div className="muted" style={{ fontSize: '0.85em' }}>
            {lounge.terminal ? `Terminal ${lounge.terminal} · ` : ''}
            {lounge.reviewCount} {lounge.reviewCount === 1 ? 'recension' : 'recensioner'}
          </div>
        </div>
        <RatingBadge value={lounge.avgRating} />
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        {lounge.reviewCount > 0 && (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            aria-expanded={mode === 'reviews'}
            onClick={showReviews}
          >
            {mode === 'reviews' ? 'Dölj recensioner' : 'Visa recensioner'}
          </button>
        )}
        {user ? (
          <button
            type="button"
            className="btn btn--sm"
            aria-expanded={mode === 'review'}
            onClick={() => setMode(mode === 'review' ? null : 'review')}
          >
            Recensera
          </button>
        ) : (
          <Link to="/login" className="btn btn--ghost btn--sm">
            Logga in för att recensera
          </Link>
        )}
      </div>
      {mode === 'review' && <ReviewForm lounge={lounge} onSaved={onSaved} onCancel={() => setMode(null)} />}
      {mode === 'reviews' && (
        <div className="stack" style={{ marginTop: 12 }}>
          {!reviews && <span className="spinner" role="status" aria-label="Laddar recensioner" />}
          {reviews &&
            reviews.map((r) => (
              <div key={r.id} className="row" style={{ alignItems: 'flex-start' }}>
                <Avatar user={r.user} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row" style={{ alignItems: 'center', gap: 6 }}>
                    <Link to={`/u/${r.user.username}`}>
                      <strong>{r.user.displayName || r.user.username}</strong>
                    </Link>
                    <Stars value={r.rating} />
                    <span className="muted" style={{ fontSize: '0.85em' }}>
                      {formatDate(r.visitedOn)}
                    </span>
                  </div>
                  {r.comment && <p style={{ margin: '4px 0 0' }}>{r.comment}</p>}
                </div>
              </div>
            ))}
        </div>
      )}
    </li>
  );
}

export function LoungeSection({ iata, lounges, setLounges }) {
  const { user } = useAuth();
  const [adding, setAdding] = useState(false);

  return (
    <section className="section" aria-labelledby="lounges-title">
      <div className="row" style={{ alignItems: 'center' }}>
        <h2 className="section__title" id="lounges-title">
          Lounger
        </h2>
        <span className="spacer" />
        {user && !adding && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setAdding(true)}>
            <IconPlus size={16} aria-hidden="true" /> Lägg till lounge
          </button>
        )}
      </div>
      {adding && (
        <AddLoungeForm
          iata={iata}
          onCancel={() => setAdding(false)}
          onAdded={(l) => {
            setLounges((ls) => [...ls, l]);
            setAdding(false);
          }}
        />
      )}
      {lounges.length === 0 && !adding ? (
        <EmptyState icon={IconLounge} title="Inga lounger registrerade">
          {!user && <p className="muted">Logga in för att lägga till en lounge.</p>}
        </EmptyState>
      ) : (
        <ul className="list">
          {lounges.map((l) => (
            <LoungeItem
              key={l.id}
              lounge={l}
              onChange={(nl) => setLounges((ls) => ls.map((x) => (x.id === nl.id ? nl : x)))}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
