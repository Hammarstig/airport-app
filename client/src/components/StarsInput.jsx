import { useState } from 'react';
import { formatRating } from '../lib/format.js';

/**
 * Klickbara stjärnor. half=true ger steg om 0,5 (vänster halva = x,5).
 * Tangentbord: piltangenter ändrar, Delete/Backspace rensar (om allowClear).
 */
export function StarsInput({ value, onChange, half = true, label, id, allowClear = true, size }) {
  const [hover, setHover] = useState(null);
  const step = half ? 0.5 : 1;
  const shown = hover ?? value ?? 0;

  const onKey = (e) => {
    const cur = value ?? 0;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      onChange(Math.min(5, cur + step || step));
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      const n = cur - step;
      onChange(n < step ? (allowClear ? null : step) : n);
    } else if (allowClear && (e.key === 'Delete' || e.key === 'Backspace')) {
      e.preventDefault();
      onChange(null);
    }
  };

  const pick = (e, star) => {
    let v = star;
    if (half) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = (e.clientX ?? rect.right) - rect.left;
      if (e.clientX && x < rect.width / 2) v = star - 0.5;
    }
    onChange(allowClear && v === value ? null : v);
  };

  const hoverAt = (e, star) => {
    if (!half) return setHover(star);
    const rect = e.currentTarget.getBoundingClientRect();
    setHover(e.clientX - rect.left < rect.width / 2 ? star - 0.5 : star);
  };

  return (
    <div className="row" style={{ alignItems: 'center', gap: 8 }}>
      <div
        id={id}
        className="stars-input"
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={5}
        aria-valuenow={value ?? 0}
        aria-valuetext={value ? `${formatRating(value)} av 5` : 'Inget betyg'}
        onKeyDown={onKey}
        onMouseLeave={() => setHover(null)}
        style={size ? { fontSize: size } : undefined}
      >
        {[1, 2, 3, 4, 5].map((star) => {
          const fill = Math.max(0, Math.min(1, shown - (star - 1)));
          return (
            <button
              key={star}
              type="button"
              tabIndex={-1}
              className="stars-input__btn"
              data-fill={fill === 1 ? 'full' : fill >= 0.5 ? 'half' : 'empty'}
              style={{ '--fill': fill }}
              aria-hidden="true"
              onClick={(e) => pick(e, star)}
              onMouseMove={(e) => hoverAt(e, star)}
            >
              ★
            </button>
          );
        })}
      </div>
      <span className="muted" aria-hidden="true" style={{ minWidth: 28 }}>
        {value ? formatRating(value) : ''}
      </span>
    </div>
  );
}
