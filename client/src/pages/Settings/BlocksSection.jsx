import { api } from '../../lib/api.js';
import { useAsync } from '../../hooks/useAsync.js';
import { useToast } from '../../components/Toast.jsx';
import { UserRow } from '../../components/UserRow.jsx';

/** Blockerade användare med möjlighet att häva blockeringen. */
export function BlocksSection() {
  const toast = useToast();
  const { data, setData } = useAsync(
    () => api.blocks(),
    [],
    () => api.peek.blocks()
  );
  if (!data || data.length === 0) return <p className="muted mt-0 mb-0">Du har inte blockerat någon.</p>;
  const unblock = async (u) => {
    try {
      await api.unblock(u);
      setData((cur) => cur.filter((x) => x.username !== u));
      toast.show(`Blockeringen av @${u} är hävd.`);
    } catch (e) {
      toast.error(e);
    }
  };
  return (
    <ul className="list" aria-label="Blockerade">
      {data.map((u) => (
        <UserRow
          key={u.username}
          user={u}
          right={
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => unblock(u.username)}>
              Häv blockering
            </button>
          }
        />
      ))}
    </ul>
  );
}
