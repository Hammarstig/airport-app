import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { useToast } from '../../components/Toast.jsx';
import { ErrorState } from '../../components/ui.jsx';
import { IconChevronLeft, IconShare } from '../../assets/icons.jsx';
import NotFoundPage from '../NotFound/NotFoundPage.jsx';
import { buildSlides } from './slides.js';

function Slide({ s, year, username, index, total }) {
  return (
    <section
      className={`wrapped-slide${s.theme === 'night' ? '' : ` wrapped-slide--${s.theme}`}`}
      aria-roledescription="bild"
      aria-label={`${index + 1} av ${total}: ${s.kicker}`}
      data-index={index}
    >
      <div className="wrapped-slide__inner">
        <div className="wrapped-slide__brand">
          Gatelog <small>Ditt {year}</small>
        </div>
        <div className="wrapped-slide__kicker">{s.kicker}</div>
        {s.big && <div className="wrapped-slide__big">{s.big}</div>}
        {s.code && <div className="wrapped-slide__big wrapped-slide__big--code">{s.code}</div>}
        {s.list && (
          <ol className="wrapped-slide__list">
            {s.list.map(([name, n]) => (
              <li key={name}>
                {name} <span>{n}</span>
              </li>
            ))}
          </ol>
        )}
        {s.stats && (
          <div className="wrapped-slide__stats">
            {s.stats.map(([v, label]) => (
              <div key={label}>
                <b>{v}</b>
                <span>{label}</span>
              </div>
            ))}
          </div>
        )}
        {s.codes?.length > 0 && (
          <div className="wrapped-slide__codes">
            {s.codes.map((c) => (
              <span key={c} className="iata-tag">
                {c}
              </span>
            ))}
          </div>
        )}
        {s.label && (
          <div className="wrapped-slide__label" style={s.codes ? { marginTop: 'auto' } : undefined}>
            {s.label}
          </div>
        )}
        {s.text && <p className="wrapped-slide__text">{s.text}</p>}
        <div className="wrapped-slide__foot">
          <span>@{username}</span>
          <span className="wrapped-slide__barcode" aria-hidden="true" />
        </div>
      </div>
    </section>
  );
}

/** Årsöversikt "Ditt <år>": bläddringsbara bilder (svep, pilar, tangenter) som kan delas som bild. */
export default function YearPage() {
  const { username, year: rawYear } = useParams();
  const year = Number(rawYear);
  const { user } = useAuth();
  const toast = useToast();
  const valid = Number.isInteger(year) && year >= 2000 && year <= 2100;
  useDocumentTitle(`Ditt ${year}`);
  const { data, error, loading, reload } = useAsync(
    () => (valid ? api.year(username, year) : Promise.resolve(null)),
    [username, year],
    () => (valid ? api.peek.year(username, year) : undefined)
  );
  const slides = useMemo(() => (data ? buildSlides(data, year) : []), [data, year]);
  const [current, setCurrent] = useState(0);
  const [busy, setBusy] = useState(false);
  const track = useRef(null);

  // Aktuell bild = den vars mitt ligger närmast bläddringsytans mitt (svep, pilar eller knappar).
  useEffect(() => {
    const el = track.current;
    if (!el || !slides.length) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const box = el.getBoundingClientRect();
      const mid = box.left + box.width / 2;
      let best = 0;
      let dist = Infinity;
      el.querySelectorAll('.wrapped-slide').forEach((sl, i) => {
        const r = sl.getBoundingClientRect();
        const d = Math.abs(r.left + r.width / 2 - mid);
        if (d < dist) {
          dist = d;
          best = i;
        }
      });
      // Vid kanterna (bred skärm, flera bilder syns) gäller första/sista bilden.
      if (el.scrollLeft <= 2) best = Math.min(best, 0);
      else if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 2) best = slides.length - 1;
      setCurrent(best);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [slides]);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const onKey = (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      goRef.current(e.key === 'ArrowRight' ? 1 : -1);
    };
    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
  }, [slides]);

  const go = (i) => {
    const el = track.current?.querySelectorAll('.wrapped-slide')[i];
    if (!el) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    // Bara vågrätt: scrollIntoView skulle även flytta sidan i höjdled under toppfältet.
    const box = track.current;
    box.scrollTo({
      left:
        box.scrollLeft +
        (el.getBoundingClientRect().left - box.getBoundingClientRect().left) -
        (box.clientWidth - el.offsetWidth) / 2,
      behavior: reduce ? 'auto' : 'smooth'
    });
    setCurrent(i);
  };

  const goRef = useRef(null);
  goRef.current = (step) => go(Math.max(0, Math.min(slides.length - 1, current + step)));

  if (!valid) return <NotFoundPage />;
  const isMe = user?.username === username;

  const shareImage = async () => {
    setBusy(true);
    try {
      const { slideImage } = await import('./slideImage.js');
      const blob = await slideImage(slides[current], { year, username });
      const file = new File([blob], `gatelog-${year}-${current + 1}.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: `Mitt ${year} på Gatelog` });
        } catch (e) {
          if (e.name !== 'AbortError') throw e;
        }
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        toast.show('Bilden är sparad.');
      }
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <header className="page__header">
        <h1 className="page__title">{isMe ? `Ditt ${year}` : `@${username}s ${year}`}</h1>
      </header>
      {error && <ErrorState error={error} onRetry={reload} />}
      {loading && !data && <div className="wrapped-slide skeleton" style={{ maxWidth: 380 }} aria-busy="true" />}
      {slides.length > 0 && (
        <>
          <div className="wrapped-progress" aria-hidden="true">
            {slides.map((s, i) => (
              <span
                key={s.id}
                className={i < current ? 'is-done' : undefined}
                aria-current={i === current ? 'step' : undefined}
              />
            ))}
          </div>
          <div
            className="wrapped"
            ref={track}
            // Bilden får plats i höjd med kontrollerna under (9:16).
            style={{ gridAutoColumns: 'min(86vw, 380px, calc((100dvh - 420px) * 9 / 16))' }}
            role="region"
            aria-roledescription="bildspel"
            aria-label={`Årsöversikt ${year}`}
            // Bläddringsbar yta ska gå att nå med tangentbord (WCAG 2.1.1); pilarna hanteras i useEffect.
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
            tabIndex={0}
          >
            {slides.map((s, i) => (
              <Slide key={s.id} s={s} year={year} username={username} index={i} total={slides.length} />
            ))}
          </div>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button
              type="button"
              className="icon-btn"
              aria-label="Föregående bild"
              disabled={current === 0}
              onClick={() => go(current - 1)}
            >
              <IconChevronLeft size={22} aria-hidden="true" />
            </button>
            <span className="muted text-sm" aria-live="polite">
              {current + 1} av {slides.length}
            </span>
            <button
              type="button"
              className="icon-btn"
              aria-label="Nästa bild"
              disabled={current === slides.length - 1}
              onClick={() => go(current + 1)}
            >
              <IconChevronLeft size={22} aria-hidden="true" style={{ transform: 'scaleX(-1)' }} />
            </button>
          </div>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button type="button" className="btn btn--primary" disabled={busy} onClick={shareImage}>
              <IconShare size={18} aria-hidden="true" /> {busy ? 'Skapar bild...' : 'Dela bilden'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
