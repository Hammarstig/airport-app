import { share } from '../lib/share.js';
import { useToast } from './Toast.jsx';
import { IconShare } from '../assets/icons.jsx';

/** Dela-knapp. getData() returnerar { title, text, url } (kan vara async). */
export function ShareButton({ getData, label = 'Dela', className = 'btn btn--ghost btn--sm', iconOnly = false }) {
  const toast = useToast();
  const onClick = async () => {
    try {
      const res = await share(await getData());
      if (res === 'copied') toast.show('Länken är kopierad.');
    } catch (e) {
      toast.error(e);
    }
  };
  return (
    <button type="button" className={className} onClick={onClick} aria-label={iconOnly ? label : undefined}>
      <IconShare size={18} aria-hidden="true" />
      {!iconOnly && <span>{label}</span>}
    </button>
  );
}
