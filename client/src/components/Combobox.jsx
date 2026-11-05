import { useEffect, useId, useState } from 'react';
import { useDebounced } from '../hooks/useDebounced.js';
import { IconSearch } from '../assets/icons.jsx';

/**
 * Tillgänglig combobox med debounce och tangentbordsnavigering.
 * fetcher(term, signal) -> Promise<item[]>; itemText(item) -> text i fältet.
 */
export function Combobox({
  label,
  placeholder,
  value,
  onSelect,
  fetcher,
  itemKey,
  itemText,
  renderItem,
  noHitsText = 'Inga träffar.',
  minChars = 2,
  id: idProp,
  autoFocus,
  hideLabel = false,
  required,
  error,
  hint,
  listLabel = 'Förslag'
}) {
  const autoId = useId();
  const id = idProp || `cb-${autoId.replace(/:/g, '')}`;
  const listId = `${id}-list`;
  const selectedText = value ? itemText(value) : '';
  const [text, setText] = useState(selectedText);
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState('');
  const q = useDebounced(text, 150);

  useEffect(() => {
    setText(selectedText);
  }, [selectedText]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < minChars || term === selectedText) {
      setItems([]);
      setLoading(false);
      setSearched('');
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    fetcher(term, ctrl.signal)
      .then((res) => {
        setItems(res || []);
        setActive(res && res.length ? 0 : -1);
        setSearched(term);
      })
      .catch((e) => {
        if (e.name !== 'AbortError') {
          setItems([]);
          setSearched(term);
        }
      })
      .finally(() => !ctrl.signal.aborted && setLoading(false));
    return () => ctrl.abort();
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (item) => {
    setText(itemText(item));
    setOpen(false);
    setItems([]);
    onSelect && onSelect(item);
  };

  const onKey = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(items.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      if (open && active >= 0 && items[active]) {
        e.preventDefault();
        choose(items[active]);
      }
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        setOpen(false);
      }
    }
  };

  const showList = open && items.length > 0;
  const noHits = open && !loading && searched && searched === q.trim() && items.length === 0;
  const describedBy = [error && `${id}-err`, hint && `${id}-hint`].filter(Boolean).join(' ') || undefined;

  return (
    <div className="field" style={{ position: 'relative' }}>
      <label htmlFor={id} className={hideLabel ? 'visually-hidden' : 'field__label'}>
        {label}
      </label>
      <div className="searchbar">
        <IconSearch size={18} aria-hidden="true" />
        <input
          id={id}
          className="searchbar__input"
          type="text"
          role="combobox"
          autoComplete="off"
          spellCheck={false}
          autoFocus={autoFocus}
          required={required}
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          placeholder={placeholder}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
            if (value && onSelect) onSelect(null);
          }}
          onKeyDown={onKey}
          onFocus={() => items.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {loading && <span className="spinner spinner--sm" aria-hidden="true" />}
      </div>
      {hint && !error && (
        <div className="field__hint" id={`${id}-hint`}>
          {hint}
        </div>
      )}
      {error && (
        <div className="field__error" id={`${id}-err`}>
          {error}
        </div>
      )}
      <ul id={listId} role="listbox" className="autocomplete" aria-label={listLabel} hidden={!showList}>
        {items.map((it, i) => (
          <li
            key={itemKey(it)}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={i === active}
            className={`autocomplete__item${i === active ? ' autocomplete__item--active' : ''}`}
            onMouseDown={(e) => e.preventDefault()}
            onMouseEnter={() => setActive(i)}
            onClick={() => choose(it)}
          >
            {renderItem(it)}
          </li>
        ))}
      </ul>
      {noHits && (
        <div className="field__hint" role="status">
          {noHitsText}
        </div>
      )}
    </div>
  );
}
