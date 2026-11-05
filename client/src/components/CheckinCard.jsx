import { memo, startTransition, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from './Toast.jsx';
import { CLASS_LABEL, SUB_RATINGS, formatDate, formatRating, timeAgo } from '../lib/format.js';
import { Avatar, IataTag, KindChip, Stars } from './ui.jsx';
import { Lightbox } from './Lightbox.jsx';
import { ShareButton } from './ShareButton.jsx';
import { IconComment, IconHeart } from '../assets/icons.jsx';

const MAX_SUBS = 3;

function travelLine(c) {
  return [c.flightNumber, c.airline?.name, c.travelClass && CLASS_LABEL[c.travelClass], c.lounge && c.lounge.name]
    .filter(Boolean)
    .join(' · ');
}

function LikeButton({ checkin }) {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [s, setS] = useState({ likes: checkin.likes ?? 0, liked: !!checkin.likedByMe, busy: false });

  const toggle = () => {
    if (!user) {
      toast.show('Logga in för att gilla check-ins.');
      return navigate('/login');
    }
    if (s.busy) return;
    const prev = s;
    // Visuell ändring direkt i samma frame; nätverket i bakgrunden.
    setS({ likes: s.likes + (s.liked ? -1 : 1), liked: !s.liked, busy: true });
    startTransition(() => {
      (prev.liked ? api.unlike(checkin.id) : api.like(checkin.id))
        .then((res) => setS({ likes: res.likes, liked: res.likedByMe, busy: false }))
        .catch((e) => {
          setS({ ...prev, busy: false });
          toast.error(e);
        });
    });
  };

  return (
    <button
      type="button"
      className={`like-btn${s.liked ? ' like-btn--active' : ''}`}
      aria-pressed={s.liked}
      aria-label={s.liked ? `Sluta gilla, ${s.likes} gillar` : `Gilla, ${s.likes} gillar`}
      onClick={toggle}
    >
      <IconHeart size={18} aria-hidden="true" />
      <span>{s.likes}</span>
    </button>
  );
}

function CheckinCardInner({ checkin: c, onDelete, hideAirport = false, hideUser = false, linkComments = true }) {
  const { user } = useAuth();
  const toast = useToast();
  const [photoIdx, setPhotoIdx] = useState(null);
  const isMine = user && c.user && user.username === c.user.username;
  const photos = c.photos || [];
  const who = c.user?.displayName || c.user?.username;
  const subs = SUB_RATINGS.filter((s) => c.ratings && c.ratings[s.key] != null);
  const travel = travelLine(c);

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
          <div className="checkin__title">
            {!hideUser && (
              <Link to={`/u/${c.user.username}`} className="checkin__user">
                {who}
              </Link>
            )}
            {!hideAirport && (
              <>
                {!hideUser && <span className="muted"> på </span>}
                <Link to={`/airport/${c.airport.iata}`} className="checkin__airport">
                  {c.airport.name}
                </Link>
              </>
            )}
          </div>
          <div className="checkin__sub">
            <time dateTime={c.visitedOn} title={formatDate(c.visitedOn)}>
              {c.visitedOn === c.createdAt?.slice(0, 10) ? timeAgo(c.createdAt) : formatDate(c.visitedOn)}
            </time>
            {c.editedAt && <span> · redigerad</span>}
          </div>
        </div>
        {!hideAirport && <IataTag iata={c.airport.iata} />}
      </div>

      <div className="checkin__body">
        <div className="row items-center gap-2">
          <KindChip kind={c.kind} />
          {c.rating != null && (
            <span className="row row--nowrap items-center gap-1">
              <Stars value={c.rating} />
              <span className="muted">{formatRating(c.rating)}</span>
            </span>
          )}
        </div>
        {subs.length > 0 && (
          <ul className="row" aria-label="Delbetyg">
            {subs.slice(0, MAX_SUBS).map((s) => (
              <li key={s.key} className="badge">
                {s.label} {c.ratings[s.key]}
              </li>
            ))}
            {subs.length > MAX_SUBS && (
              <li className="badge">
                <span aria-hidden="true">+{subs.length - MAX_SUBS}</span>
                <span className="visually-hidden">
                  {subs
                    .slice(MAX_SUBS)
                    .map((s) => `${s.label} ${c.ratings[s.key]}`)
                    .join(', ')}
                </span>
              </li>
            )}
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
        {travel && <p className="checkin__details">{travel}</p>}
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
        <LikeButton checkin={c} />
        {linkComments ? (
          <Link to={`/c/${c.id}`} className="action-btn" aria-label={`Kommentarer, ${c.commentCount ?? 0}`}>
            <IconComment size={18} aria-hidden="true" />
            <span>{c.commentCount ?? 0}</span>
          </Link>
        ) : null}
        <ShareButton
          iconOnly
          className="action-btn"
          label="Dela check-in"
          getData={() => ({
            title: `${who} på ${c.airport.iata}`,
            text: `${who} checkade in på ${c.airport.name}${c.rating ? ` (${formatRating(c.rating)}/5)` : ''}`,
            url: `/c/${c.id}`
          })}
        />
        <span className="spacer" />
        {isMine && (
          <>
            <Link to={`/checkin/${c.id}/edit`} className="btn btn--ghost btn--sm">
              Redigera
            </Link>
            {onDelete && (
              <button type="button" className="btn btn--ghost btn--sm btn--danger" onClick={remove}>
                Radera
              </button>
            )}
          </>
        )}
      </div>
    </article>
  );
}

export const CheckinCard = memo(CheckinCardInner);
