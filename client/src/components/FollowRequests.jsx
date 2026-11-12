import { api } from '../lib/api.js';
import { useAsync } from '../hooks/useAsync.js';
import { useToast } from './Toast.jsx';
import { UserRow } from './UserRow.jsx';

/** Väntande följförfrågningar (privat profil) med Godkänn/Avböj. Visar inget när listan är tom. */
export function FollowRequests({ title = true }) {
  const toast = useToast();
  const { data, setData } = useAsync(
    () => api.followRequests(),
    [],
    () => api.peek.followRequests()
  );
  if (!data || data.length === 0) return null;
  const act = async (u, accept) => {
    setData((cur) => cur.filter((x) => x.username !== u));
    try {
      if (accept) await api.acceptFollow(u);
      else await api.declineFollow(u);
      toast.show(accept ? `@${u} följer dig nu.` : `Förfrågan från @${u} avböjd.`);
    } catch (e) {
      toast.error(e);
    }
  };
  return (
    <section aria-labelledby="fr-title" className="stack stack--sm">
      {title && (
        <h2 className="section__title mt-0 mb-0" id="fr-title">
          Följförfrågningar ({data.length})
        </h2>
      )}
      <ul className="list" aria-label="Följförfrågningar">
        {data.map((u) => (
          <UserRow
            key={u.username}
            user={u}
            right={
              <span className="row row--nowrap gap-1">
                <button type="button" className="btn btn--primary btn--sm" onClick={() => act(u.username, true)}>
                  Godkänn
                </button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => act(u.username, false)}>
                  Avböj
                </button>
              </span>
            }
          />
        ))}
      </ul>
    </section>
  );
}
