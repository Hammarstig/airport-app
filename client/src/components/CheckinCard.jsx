import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from './Toast.jsx';
import { formatDate, formatRating, placeLine, SUB_RATINGS } from '../lib/format.js';
import { Avatar, IataTag, KindChip, Stars } from './ui.jsx';
import { IconHeart } from '../assets/icons.jsx';
import { TravelDetailList } from './TravelDetails.jsx';
import { Lightbox } from './Lightbox.jsx';

export function CheckinCard({ checkin, onDelete, hideAirport = false, hideUser = false }) {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [likes, setLikes] = useState(checkin.likes ?? 0);
  const [liked, setLiked] = useState(!!checkin.likedByMe);
  const [busy, setBusy] = useState(false);
  const [photoIdx, setPhotoIdx] = useState(null);

  const c = checkin;
  const isMine = user && c.user && user.username === c.user.username;
  const photos = c.photos || [];
  const who = c.user?.displayName || c.user?.username;
  const subs = SUB_RATINGS.filter((s) => c.ratings && c.ratings[s.key] != null);

  const toggleLike = async () => {
    if (!user) {
      toast.show('Logga in för att gilla check-ins.');
      navigate('/login');
      return;
    }
    if (busy) return;
    setBusy(true);
    const prev = { likes, liked };
    setLiked(!liked);
    setLikes(likes + (liked ? -1 : 1));
    try {
      const res = liked ? await api.unlike(c.id) : await api.like(c.id);
      setLikes(res.likes);
      setLiked(res.likedByMe);
    } catch (e) {
      setLikes(prev.likes);
      setLiked(prev.liked);
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm('Radera denna check-in?')) return;
    try {
      await api.deleteCheckin(c.id);
      toast.show('Check-in raderad.');
      onDelete && onDelete(c.id);
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <article className="card checkin" aria-label={`${who} på ${c.airport?.iata}`}>
      <div className="checkin__head">
        {!hideUser && (
          <Link to={`/u/${c.user.username}`} className="checkin__avatar" aria-label={`Profil för ${who}`}>
            <Avatar user={c.user} />
          </Link>
        )}
        <div className="checkin__meta">
          <div>
            {!hideUser && (
              <>
                <Link to={`/u/${c.user.username}`}>
                  <strong>{who}</strong>
                </Link>{' '}
              </>
            )}
            {!hideAirport && (
              <span className="muted">
                {hideUser ? '' : 'på '}
                <Link to={`/airport/${c.airport.iata}`}>{c.airport.name}</Link>
              </span>
            )}
          </div>
          <div className="muted" style={{ fontSize: '0.85em' }}>
            <time dateTime={c.visitedOn}>{formatDate(c.visitedOn)}</time>
            {!hideAirport && placeLine(c.airport) ? ` · ${placeLine(c.airport)}` : ''}
          </div>
        </div>
        {!hideAirport && <IataTag iata={c.airport.iata} />}
      </div>

      <div className="checkin__body">
        <div className="row" style={{ alignItems: 'center' }}>
          <KindChip kind={c.kind} />
          {c.rating != null && (
            <span className="row" style={{ alignItems: 'center', gap: 6 }}>
              <Stars value={c.rating} />
              <span className="muted">{formatRating(c.rating)}</span>
            </span>
          )}
        </div>
        {subs.length > 0 && (
          <ul className="row" style={{ listStyle: 'none', padding: 0, margin: 0, gap: 6 }} aria-label="Delbetyg">
            {subs.map((s) => (
              <li key={s.key} className="badge">
                {s.label} {c.ratings[s.key]}/5
              </li>
            ))}
          </ul>
        )}
        {c.comment && <p className="checkin__comment">{c.comment}</p>}
        {photos.length > 0 && (
          <div className="photo-strip" aria-label="Foton">
            {photos.map((p, i) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPhotoIdx(i)}
                aria-label={`Visa foto ${i + 1} av ${photos.length}`}
              >
                <img src={p.url} alt="" loading="lazy" decoding="async" width={72} height={72} />
              </button>
            ))}
          </div>
        )}
        <TravelDetailList checkin={c} />
      </div>
      {photoIdx !== null && (
        <Lightbox
          photos={photos.map((p) => ({ ...p, caption: `${who} på ${c.airport.iata} · ${formatDate(c.visitedOn)}` }))}
          index={photoIdx}
          onIndex={setPhotoIdx}
          onClose={() => setPhotoIdx(null)}
        />
      )}

      <div className="checkin__actions">
        <button
          type="button"
          className={`like-btn${liked ? ' like-btn--active' : ''}`}
          aria-pressed={liked}
          aria-label={liked ? `Sluta gilla (${likes})` : `Gilla (${likes})`}
          onClick={toggleLike}
        >
          <IconHeart size={18} aria-hidden="true" />
          <span>{likes}</span>
        </button>
        <span className="spacer" />
        {isMine && onDelete && (
          <button type="button" className="btn btn--ghost btn--sm btn--danger" onClick={remove}>
            Radera
          </button>
        )}
      </div>
    </article>
  );
}
