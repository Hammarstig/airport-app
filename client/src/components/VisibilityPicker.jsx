import { useId } from 'react';
import { IconGlobe, IconLock, IconUsers } from '../assets/icons.jsx';

const OPTIONS = [
  { value: 'public', title: 'Alla', desc: 'Syns i flöden och sök', icon: IconGlobe },
  { value: 'friends', title: 'Följare', desc: 'Bara godkända följare', icon: IconUsers },
  { value: 'private', title: 'Bara jag', desc: 'Syns bara för dig', icon: IconLock }
];

/** Val av synlighet (Alla / Följare / Bara jag) som radiogrupp med förklaringar. */
export function VisibilityPicker({ value, onChange, label }) {
  const name = `vis-${useId().replace(/:/g, '')}`;
  return (
    <div className="visibility-picker" role="radiogroup" aria-label={label}>
      {OPTIONS.map((o) => {
        const Icon = o.icon;
        return (
          <label key={o.value} className={`visibility-option${value === o.value ? ' visibility-option--active' : ''}`}>
            <input
              type="radio"
              className="visually-hidden"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
            />
            <Icon size={22} aria-hidden="true" />
            <span className="visibility-option__title">{o.title}</span>
            <span className="visibility-option__desc">{o.desc}</span>
          </label>
        );
      })}
    </div>
  );
}

const CHIP = { friends: ['Följare', IconUsers], private: ['Privat', IconLock] };

/** Liten etikett på egna check-ins som inte är publika. */
export function VisibilityChip({ visibility }) {
  const c = CHIP[visibility];
  if (!c) return null;
  const [text, Icon] = c;
  return (
    <span className="visibility-chip">
      <Icon size={14} aria-hidden="true" />
      {text}
    </span>
  );
}
