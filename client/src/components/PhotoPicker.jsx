import { useId } from 'react';
import { makeThumbnail } from '../lib/image.js';
import { IconCamera, IconClose, IconImage } from '../assets/icons.jsx';

export const MAX_PHOTOS = 4;

/**
 * Fotoväljare: "Ta foto" öppnar kameran direkt på Android (capture="environment"),
 * "Välj från galleri" öppnar bildväljaren. value: [{ file, url (data-URL), key }].
 */
export function PhotoPicker({ value, onChange, onError }) {
  const id = useId().replace(/:/g, '');
  const left = MAX_PHOTOS - value.length;

  const add = async (e) => {
    const files = Array.from(e.target.files || []).filter((f) => f.type.startsWith('image/'));
    e.target.value = '';
    if (!files.length) return;
    if (files.length > left) onError && onError(`Max ${MAX_PHOTOS} foton per check-in.`);
    const added = [];
    for (const file of files.slice(0, left)) {
      try {
        added.push({
          file,
          url: await makeThumbnail(file),
          key: `${file.name}-${file.size}-${Date.now()}-${added.length}`
        });
      } catch (err) {
        onError && onError(err.message);
      }
    }
    onChange([...value, ...added]);
  };

  const remove = (i) => {
    onChange(value.filter((_, j) => j !== i));
  };

  return (
    <div className="field">
      <span className="field__label" id={`${id}-label`}>
        Foton ({value.length}/{MAX_PHOTOS})
      </span>
      <div className="photo-picker" role="group" aria-labelledby={`${id}-label`}>
        {value.map((p, i) => (
          <div className="photo-picker__tile" key={p.key}>
            <img src={p.url} alt={`Valt foto ${i + 1}`} />
            <button
              type="button"
              className="photo-picker__remove"
              aria-label={`Ta bort foto ${i + 1}`}
              onClick={() => remove(i)}
            >
              <IconClose aria-hidden="true" />
            </button>
          </div>
        ))}
        {left > 0 && (
          <>
            <label className="photo-picker__add">
              <IconCamera aria-hidden="true" />
              Ta foto
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={add}
                aria-label="Ta foto med kameran"
              />
            </label>
            <label className="photo-picker__add">
              <IconImage aria-hidden="true" />
              Välj från galleri
              <input type="file" accept="image/*" multiple onChange={add} aria-label="Välj foton från galleriet" />
            </label>
          </>
        )}
      </div>
      <span className="field__hint">Bilder skalas ner till max 1600 px innan uppladdning.</span>
    </div>
  );
}
