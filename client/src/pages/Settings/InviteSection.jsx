import { useState } from 'react';
import { api } from '../../lib/api.js';
import { useAsync } from '../../hooks/useAsync.js';
import { useToast } from '../../components/Toast.jsx';
import { ShareButton } from '../../components/ShareButton.jsx';

const absolute = (url) => new URL(url, window.location.origin).href;

/**
 * Inbjudningslänk (.invite-card). Den som registrerar sig via länken och du följer varandra direkt.
 * Visar senaste aktiva länken, eller skapar en vid behov.
 */
export function InviteCard({ compact = false }) {
  const toast = useToast();
  const { data, setData, error } = useAsync(
    () => api.invites(),
    [],
    () => api.peek.invites()
  );
  const [busy, setBusy] = useState(false);
  const invite = data?.[0];

  const create = async () => {
    setBusy(true);
    try {
      const inv = await api.createInvite();
      setData((cur) => [inv, ...(cur || [])]);
      return inv;
    } catch (e) {
      toast.error(e);
      return null;
    } finally {
      setBusy(false);
    }
  };
  const ensure = async () => invite || (await create());

  const copy = async () => {
    const inv = await ensure();
    if (!inv) return;
    try {
      await navigator.clipboard.writeText(absolute(inv.url));
      toast.show('Länken är kopierad.');
    } catch {
      toast.error('Kunde inte kopiera. Markera länken och kopiera själv.');
    }
  };

  return (
    <div className="invite-card">
      <h3 className="invite-card__title">Bjud in dina resvänner</h3>
      <p className="invite-card__text">Ni följer varandra direkt och ser varandras check-ins.</p>
      {invite ? (
        <div className="invite-card__link">
          <span aria-label="Inbjudningslänk">{absolute(invite.url).replace(/^https?:\/\//, '')}</span>
          <button type="button" className="btn btn--sm" onClick={copy}>
            Kopiera
          </button>
        </div>
      ) : (
        error && <p className="muted mt-0 mb-0">{error.message}</p>
      )}
      <div className="invite-card__actions">
        {invite ? (
          <ShareButton
            className="btn btn--primary"
            label="Dela länk"
            getData={() => ({
              title: 'Gatelog',
              text: 'Följ mina flygplatsbesök på Gatelog',
              url: invite.url
            })}
          />
        ) : (
          <button type="button" className="btn btn--primary" disabled={busy || !data} onClick={create}>
            {busy ? 'Skapar...' : 'Skapa inbjudningslänk'}
          </button>
        )}
      </div>
      {!compact && invite && (
        <p className="muted text-sm mt-0 mb-0">
          Använd {invite.uses} av {invite.maxUses} gånger. Gäller till{' '}
          {new Date(invite.expiresAt).toLocaleDateString('sv-SE')}.
        </p>
      )}
    </div>
  );
}

export function InviteSection() {
  return <InviteCard />;
}
