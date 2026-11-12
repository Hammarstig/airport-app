import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useToast } from '../../components/Toast.jsx';
import { ReportDialog } from '../../components/ReportDialog.jsx';
import { IconBan, IconFlag, IconMore } from '../../assets/icons.jsx';

/** Meny med Rapportera och Blockera för en annan användares profil. */
export function ProfileActions({ username }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const wrap = useRef(null);

  useEffect(() => {
    if (!open) return;
    const first = wrap.current?.querySelector('[role=menuitem]');
    first?.focus();
    const close = (e) => {
      if (e.type === 'keydown' && e.key !== 'Escape') return;
      if (e.type === 'pointerdown' && wrap.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('keydown', close);
    document.addEventListener('pointerdown', close);
    return () => {
      document.removeEventListener('keydown', close);
      document.removeEventListener('pointerdown', close);
    };
  }, [open]);

  const block = async () => {
    setOpen(false);
    if (
      !window.confirm(
        `Blockera @${username}? Ni slutar följa varandra och ser inte varandras check-ins eller kommentarer.`
      )
    )
      return;
    try {
      await api.block(username);
      toast.show(`@${username} är blockerad. Du kan häva det i Inställningar.`);
      navigate('/', { replace: true });
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <div className="menu-wrap" ref={wrap}>
      <button
        type="button"
        className="icon-btn menu-btn"
        aria-label="Fler val"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <IconMore size={20} aria-hidden="true" />
      </button>
      {open && (
        <div className="menu menu--sheet" role="menu" aria-label={`Val för @${username}`}>
          <button
            type="button"
            role="menuitem"
            className="menu__item"
            onClick={() => {
              setOpen(false);
              setReporting(true);
            }}
          >
            <IconFlag size={18} aria-hidden="true" /> Rapportera
          </button>
          <button type="button" role="menuitem" className="menu__item menu__item--danger" onClick={block}>
            <IconBan size={18} aria-hidden="true" /> Blockera
          </button>
        </div>
      )}
      {reporting && <ReportDialog type="user" target={username} onClose={() => setReporting(false)} />}
    </div>
  );
}
