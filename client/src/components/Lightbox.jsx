import { useEffect, useRef } from 'react';
import { IconClose } from '../assets/icons.jsx';

/** Helskärmsvisning av foton. photos: [{url, caption?}], index styr vilket som visas. */
export function Lightbox({ photos, index, onIndex, onClose }) {
  const closeRef = useRef(null);
  const p = photos[index];
  const many = photos.length > 1;
  const go = (d) => onIndex((index + d + photos.length) % photos.length);

  useEffect(() => {
    const prevFocus = document.activeElement;
    closeRef.current && closeRef.current.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (many && e.key === 'ArrowRight') go(1);
      else if (many && e.key === 'ArrowLeft') go(-1);
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      prevFocus && prevFocus.focus && prevFocus.focus();
    };
  });

  // Svep vänster/höger på touch.
  const touchX = useRef(null);
  if (!p) return null;
  return (
    // Bakgrundsklick stänger; tangentbordet (Escape, pilar) hanteras på document ovan.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <div
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={`Foto ${index + 1} av ${photos.length}`}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (!many || touchX.current == null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
        touchX.current = null;
      }}
    >
      <img src={p.url} alt={p.caption || `Foto ${index + 1}`} width={p.width} height={p.height} />
      {p.caption && <div className="lightbox__caption">{p.caption}</div>}
      <button ref={closeRef} type="button" className="lightbox__close" aria-label="Stäng" onClick={onClose}>
        <IconClose size={22} aria-hidden="true" />
      </button>
      {many && (
        <>
          <button type="button" className="lightbox__prev" aria-label="Föregående foto" onClick={() => go(-1)}>
            ‹
          </button>
          <button type="button" className="lightbox__next" aria-label="Nästa foto" onClick={() => go(1)}>
            ›
          </button>
        </>
      )}
    </div>
  );
}
