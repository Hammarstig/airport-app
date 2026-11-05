import { useId, useState } from 'react';
import { formatRating } from '../lib/format.js';

const HALF_LEFT = { position: 'absolute', inset: '0 50% 0 0', cursor: 'pointer' };
const HALF_RIGHT = { position: 'absolute', inset: '0 0 0 50%', cursor: 'pointer' };
const FULL = { position: 'absolute', inset: 0, cursor: 'pointer' };

/**
 * Betyg som en radiogrupp (inbyggd tangentbordsnavigering med piltangenter).
 * half=true ger steg om 0,5: vänster halva av en stjärna = x,5. Tryck på valt betyg igen för att rensa.
 */
export function StarsInput({ value, onChange, half = true, label, size, allowClear = true }) {
  const name = `stars-${useId().replace(/:/g, '')}`;
  const [hover, setHover] = useState(null);
  const shown = hover ?? value ?? 0;
  const step = half ? 0.5 : 1;

  const option = (v, style) => (
    <label key={v} style={style} onMouseEnter={() => setHover(v)}>
      <input
        type="radio"
        className="visually-hidden"
        name={name}
        value={v}
        checked={value === v}
        aria-label={`${formatRating(v)} av 5`}
        onChange={() => onChange(v)}
        onClick={() => allowClear && value === v && onChange(null)}
      />
    </label>
  );

  return (
    <div className="row row--nowrap items-center gap-2">
      <fieldset
        className="stars-input fieldset-plain"
        onMouseLeave={() => setHover(null)}
        style={size ? { fontSize: size } : undefined}
      >
        <legend className="visually-hidden">{label}</legend>
        {[1, 2, 3, 4, 5].map((star) => {
          const fill = Math.max(0, Math.min(1, shown - (star - 1)));
          return (
            <span key={star} className="stars-input__btn" style={{ '--fill': fill }}>
              {half ? [option(star - step, HALF_LEFT), option(star, HALF_RIGHT)] : option(star, FULL)}
            </span>
          );
        })}
      </fieldset>
      <span className="muted tabular" aria-hidden="true">
        {value ? formatRating(value) : ''}
      </span>
    </div>
  );
}
