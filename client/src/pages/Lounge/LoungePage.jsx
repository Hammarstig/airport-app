import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { formatDate, formatRating, placeLine } from '../../lib/format.js';
import { ReviewForm } from '../../components/LoungeForms.jsx';
import { Avatar, EmptyState, ErrorState, Spinner, Stars, Stat } from '../../components/ui.jsx';
import { IconLounge } from '../../assets/icons.jsx';
import NotFoundPage from '../NotFound/NotFoundPage.jsx';

export default function LoungePage() {
  const { id } = useParams();
  const { user } = useAuth();
  const {
    data: lounge,
    loading,
    error,
    reload
  } = useAsync(async () => {
    const l = await api.lounge(id);
    let airport = l.airport || null;
    if (!airport && l.iata) airport = await api.airport(l.iata).catch(() => null);
    return { ...l, airport };
  }, [id]);
  const [reviewing, setReviewing] = useState(false);
  useDocumentTitle(lounge ? lounge.name : 'Lounge');

  if (loading && !lounge)
    return (
      <div className="page">
        <Spinner />
      </div>
    );
  if (error?.status === 404) return <NotFoundPage message="Loungen finns inte." />;
  if (error)
    return (
      <div className="page">
        <ErrorState error={error} onRetry={reload} />
      </div>
    );

  const ap = lounge.airport;
  const reviews = lounge.reviews || [];

  return (
    <div className="page">
      <header className="airport-hero">
        <div className="airport-hero__code" aria-hidden="true">
          <IconLounge size={40} />
        </div>
        <h1 className="airport-hero__name">{lounge.name}</h1>
        <p className="airport-hero__place">
          {ap ? (
            <>
              <Link to={`/airport/${ap.iata}`}>
                {ap.iata} {ap.name}
              </Link>
              {placeLine(ap) ? ` · ${placeLine(ap)}` : ''}
            </>
          ) : (
            <Link to={`/airport/${lounge.iata}`}>{lounge.iata}</Link>
          )}
          {lounge.terminal ? ` · Terminal ${lounge.terminal}` : ''}
        </p>
      </header>

      <section className="section" aria-label="Statistik">
        <div className="grid grid--2">
          <Stat value={formatRating(lounge.avgRating)} label="Snittbetyg" />
          <Stat value={lounge.reviewCount ?? reviews.length} label="Recensioner" />
        </div>
      </section>

      <section className="section" aria-labelledby="lr-title">
        <div className="row" style={{ alignItems: 'center' }}>
          <h2 className="section__title" id="lr-title">
            Recensioner
          </h2>
          <span className="spacer" />
          {user ? (
            !reviewing && (
              <button type="button" className="btn btn--primary btn--sm" onClick={() => setReviewing(true)}>
                Recensera
              </button>
            )
          ) : (
            <Link to="/login" className="btn btn--ghost btn--sm">
              Logga in för att recensera
            </Link>
          )}
        </div>
        {reviewing && (
          <div className="card">
            <div className="card__body">
              <ReviewForm
                lounge={lounge}
                onCancel={() => setReviewing(false)}
                onSaved={() => {
                  setReviewing(false);
                  reload();
                }}
              />
            </div>
          </div>
        )}
        {reviews.length === 0 ? (
          <EmptyState icon={IconLounge} title="Inga recensioner ännu" />
        ) : (
          <ul className="list">
            {reviews.map((r) => (
              <li key={r.id} className="list__item" style={{ alignItems: 'flex-start' }}>
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
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
