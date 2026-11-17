import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { badgeUrl, TIER_LABEL } from './Badges.jsx';
import { ShareButton } from './ShareButton.jsx';
import { IconClose } from '../assets/icons.jsx';

/**
 * Helskärmsögonblick (.badge-moment) för nya märken och ny nivå efter en check-in.
 * moments: [{ kind: 'badge', badge } | { kind: 'level', level, title }]. Visas ett i taget.
 */
export function BadgeMoment({ moments, username, onDone }) {
  const [i, setI] = useState(0);
  const primary = useRef(null);
  const opener = useRef(typeof document !== 'undefined' ? document.activeElement : null);
  const m = moments[i];

  const next = () => {
    if (i + 1 < moments.length) setI(i + 1);
    else {
      onDone();
      opener.current?.focus?.();
    }
  };

  useEffect(() => {
    primary.current?.focus();
  }, [i]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        onDone();
        opener.current?.focus?.();
      } else if (e.key === 'Tab') {
        // Fokusfälla inom dialogen.
        const els = [...document.querySelectorAll('.badge-moment button')];
        if (!els.length) return;
        const first = els[0];
        const last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onDone]);

  if (!m) return null;
  const isLevel = m.kind === 'level';
  const b = m.badge;
  const tier = isLevel ? 'level' : b.tier || 'bronze';
  const url = !isLevel && badgeUrl(b);
  const title = isLevel ? `Nivå ${m.level}` : b.name;
  const kicker = isLevel ? 'Ny nivå' : b.tierLevel > 1 ? 'Ny nivå på märket' : 'Nytt märke';
  const desc = isLevel ? (m.title ? `Du är nu ${m.title}.` : null) : b.description;

  return createPortal(
    <div
      className={`badge-moment badge-moment--${tier}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="bm-title"
      aria-describedby={desc ? 'bm-desc' : undefined}
    >
      <div className="badge-moment__confetti" aria-hidden="true">
        {Array.from({ length: 20 }, (_, k) => (
          <i key={k} />
        ))}
      </div>
      <button
        type="button"
        className="icon-btn badge-moment__close"
        aria-label="Stäng"
        onClick={() => {
          onDone();
          opener.current?.focus?.();
        }}
      >
        <IconClose size={22} aria-hidden="true" />
      </button>
      <div className="badge-moment__stage" key={i}>
        <div className="badge-moment__rays" aria-hidden="true" />
        {isLevel ? (
          <div className="badge-moment__level" aria-hidden="true">
            {m.level}
          </div>
        ) : url ? (
          <img className="badge-moment__badge" src={url} alt="" />
        ) : null}
      </div>
      <p className="badge-moment__kicker">{kicker}</p>
      <h2 className="badge-moment__title" id="bm-title">
        {title}
      </h2>
      {!isLevel && b.tier && <span className={`tier-chip tier--${b.tier}`}>{TIER_LABEL[b.tier]}</span>}
      {desc && (
        <p className="badge-moment__desc" id="bm-desc">
          {desc}
        </p>
      )}
      <div className="badge-moment__actions">
        <ShareButton
          className="btn btn--primary"
          label="Dela"
          getData={() => ({
            title: isLevel ? `Nivå ${m.level} på Gatelog` : `${b.name} på Gatelog`,
            text: isLevel
              ? `Jag nådde nivå ${m.level} på Gatelog!`
              : `Jag låste upp ${b.name}${b.tier ? ` (${TIER_LABEL[b.tier]})` : ''} på Gatelog!`,
            url: `/u/${username}?tab=badges`
          })}
        />
        <button ref={primary} type="button" className="btn btn--ghost" onClick={next}>
          {i + 1 < moments.length ? `Nästa (${i + 2} av ${moments.length})` : 'Fortsätt'}
        </button>
      </div>
    </div>,
    document.body
  );
}

/** Ögonblicken för ett check-in-svar: nivå först, sedan märken (högst nivå först). */
export function momentsFor(c) {
  const list = [];
  if (c.levelUp && c.levelInfo) list.push({ kind: 'level', level: c.levelInfo.level, title: c.levelInfo.title });
  const badges = [...(c.newBadges || [])].sort((a, z) => (z.tierLevel || 0) - (a.tierLevel || 0));
  for (const badge of badges) list.push({ kind: 'badge', badge });
  return list;
}
