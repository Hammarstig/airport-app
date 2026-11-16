import { useEffect, useRef, useState } from 'react';
import { IconMore } from '../assets/icons.jsx';

/**
 * "..."-meny (DESIGN.md: .menu-wrap/.menu). items: [{ label, icon, onSelect, danger }].
 * Esc eller tryck utanför stänger, piltangenter flyttar mellan valen, fokus tillbaka till knappen.
 */
export function ActionMenu({ label, items, buttonLabel = 'Fler val', up = false }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  const btn = useRef(null);

  useEffect(() => {
    if (!open) return;
    const all = () => [...(wrap.current?.querySelectorAll('[role=menuitem]') || [])];
    all()[0]?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        btn.current?.focus();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const list = all();
        const i = list.indexOf(document.activeElement);
        const next = (i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length;
        list[next]?.focus();
      } else if (e.key === 'Tab') setOpen(false);
    };
    const onDown = (e) => {
      if (!wrap.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  if (!items.length) return null;
  return (
    <div className="menu-wrap" ref={wrap}>
      <button
        ref={btn}
        type="button"
        className="icon-btn menu-btn"
        aria-label={buttonLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <IconMore size={20} aria-hidden="true" />
      </button>
      {open && (
        <div className={`menu menu--sheet${up ? ' menu--up' : ''}`} role="menu" aria-label={label}>
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              className={`menu__item${it.danger ? ' menu__item--danger' : ''}`}
              onClick={() => {
                setOpen(false);
                it.onSelect();
              }}
            >
              {it.icon} {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
