import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { timeAgo } from '../lib/format.js';
import { useToast } from './Toast.jsx';
import { Avatar, ErrorState } from './ui.jsx';
import { SkeletonRows } from './Skeleton.jsx';
import { IconComment as IconSend } from '../assets/icons.jsx';

const MAX = 500;

function CommentItem({ c, onChanged, onDeleted }) {
  const { user } = useAuth();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(c.body);
  const mine = user && user.username === c.user.username;

  const save = async (e) => {
    e.preventDefault();
    try {
      onChanged(await api.editComment(c.id, text.trim()));
      setEditing(false);
    } catch (err) {
      toast.error(err);
    }
  };
  const remove = async () => {
    if (!window.confirm('Ta bort kommentaren?')) return;
    try {
      await api.deleteComment(c.id);
      onDeleted(c.id);
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <li className={`comment${mine ? ' comment--mine' : ''}`}>
      <Avatar user={c.user} size="sm" />
      <div className="comment__body">
        <div className="comment__meta">
          <Link to={`/u/${c.user.username}`}>
            <strong>{c.user.displayName || c.user.username}</strong>
          </Link>{' '}
          <time dateTime={c.createdAt}>
            {timeAgo(c.createdAt)}
            {c.editedAt ? ' · redigerad' : ''}
          </time>
        </div>
        {editing ? (
          <form onSubmit={save} className="stack stack--sm">
            <label className="visually-hidden" htmlFor={`edit-c-${c.id}`}>
              Redigera kommentar
            </label>
            <textarea
              id={`edit-c-${c.id}`}
              className="textarea"
              rows={2}
              maxLength={MAX}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="row">
              <button type="submit" className="btn btn--primary btn--sm" disabled={!text.trim()}>
                Spara
              </button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(false)}>
                Avbryt
              </button>
            </div>
          </form>
        ) : (
          <p className="comment__text">{c.body}</p>
        )}
        {!editing && (mine || c.canDelete) && (
          <div className="comment__actions">
            {mine && (
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(true)}>
                Redigera
              </button>
            )}
            {c.canDelete && (
              <button type="button" className="btn btn--ghost btn--sm" onClick={remove}>
                Ta bort
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

/** Kommentarstråd för en check-in med formulär längst ned. */
export function Comments({ checkinId, onCount }) {
  const { user } = useAuth();
  const toast = useToast();
  const { data, loading, error, reload, setData } = useAsync(
    () => api.comments(checkinId),
    [checkinId],
    () => api.peek.comments(checkinId)
  );
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const update = (fn) =>
    setData((cur) => {
      const next = fn(cur || []);
      onCount && onCount(next.length);
      return next;
    });

  const submit = async (e) => {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      const c = await api.addComment(checkinId, text.trim());
      update((cur) => [...cur, c]);
      setText('');
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="comments-title">
      <h2 className="section__title" id="comments-title">
        Kommentarer
      </h2>
      {loading && !data && <SkeletonRows count={2} />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && data.length === 0 && <p className="muted">Inga kommentarer ännu.</p>}
      {data && data.length > 0 && (
        <ul className="comment-thread">
          {data.map((c) => (
            <CommentItem
              key={c.id}
              c={c}
              onChanged={(nc) => update((cur) => cur.map((x) => (x.id === nc.id ? nc : x)))}
              onDeleted={(id) => update((cur) => cur.filter((x) => x.id !== id))}
            />
          ))}
        </ul>
      )}
      {user ? (
        <form className="comment-form" onSubmit={submit}>
          <label className="visually-hidden" htmlFor="new-comment">
            Skriv en kommentar
          </label>
          <input
            id="new-comment"
            className="input"
            maxLength={MAX}
            placeholder="Skriv en kommentar..."
            autoComplete="off"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button type="submit" className="icon-btn" aria-label="Skicka kommentar" disabled={busy || !text.trim()}>
            <IconSend size={20} aria-hidden="true" />
          </button>
        </form>
      ) : (
        <p className="muted">
          <Link to="/login">Logga in</Link> för att kommentera.
        </p>
      )}
    </section>
  );
}
