// API v2: följa, kommentarer på check-ins och notiser.
import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { h, bad, notFound, HttpError, cleanText, paging, USER_COLS, userFrom } from '../util.js';
import { transaction } from '../db.js';
import { notify, NOTIFICATION_SELECT, notificationFrom } from '../notify.js';
import { awardBadges } from '../badges.js';

export default function socialRoutes({ db, limiters }) {
  const r = Router();
  const userByName = db.prepare('SELECT id, username FROM users WHERE username = ?');
  const followerCount = db.prepare('SELECT COUNT(*) AS n FROM follows WHERE followee_id = ?');

  function userOr404(raw) {
    const u = userByName.get(String(raw).toLowerCase());
    if (!u) throw notFound('Användaren finns inte');
    return u;
  }

  // ---- Följa ----
  r.post('/users/:username/follow', requireAuth, limiters.follow, h((req, res) => {
    const u = userOr404(req.params.username);
    if (u.id === req.user.id) throw bad('Du kan inte följa dig själv');
    transaction(db, () => {
      const info = db.prepare('INSERT OR IGNORE INTO follows (follower_id, followee_id, created_at) VALUES (?, ?, ?)')
        .run(req.user.id, u.id, new Date().toISOString());
      if (info.changes) notify(db, { userId: u.id, type: 'follow', actorId: req.user.id });
    });
    res.json({ following: true, followers: followerCount.get(u.id).n });
  }));

  r.delete('/users/:username/follow', requireAuth, h((req, res) => {
    const u = userOr404(req.params.username);
    db.prepare('DELETE FROM follows WHERE follower_id = ? AND followee_id = ?').run(req.user.id, u.id);
    res.json({ following: false, followers: followerCount.get(u.id).n });
  }));

  const followList = (column, other) => h((req, res) => {
    const u = userOr404(req.params.username);
    const { limit, offset } = paging(req.query, { defLimit: 50, maxLimit: 200 });
    const rows = db.prepare(`SELECT ${USER_COLS('x', '')},
        EXISTS (SELECT 1 FROM follows m WHERE m.follower_id = ? AND m.followee_id = x.id) AS followed_by_me
      FROM follows f JOIN users x ON x.id = f.${other}
      WHERE f.${column} = ? ORDER BY f.created_at DESC, x.username LIMIT ? OFFSET ?`)
      .all(req.user?.id ?? -1, u.id, limit, offset);
    res.json(rows.map((row) => ({ ...userFrom(row), followedByMe: !!row.followed_by_me })));
  });
  r.get('/users/:username/followers', followList('followee_id', 'follower_id'));
  r.get('/users/:username/following', followList('follower_id', 'followee_id'));

  // ---- Kommentarer ----
  const COMMENT_SELECT = `
    SELECT m.id, m.checkin_id, m.body, m.created_at, m.edited_at, m.user_id, c.user_id AS owner_id, ${USER_COLS('u', 'u_')}
    FROM comments m JOIN users u ON u.id = m.user_id JOIN checkins c ON c.id = m.checkin_id`;
  const commentFrom = (row, viewerId) => ({
    id: row.id,
    checkinId: row.checkin_id,
    user: userFrom(row, 'u_'),
    body: row.body,
    createdAt: row.created_at,
    editedAt: row.edited_at ?? null,
    canDelete: viewerId != null && (viewerId === row.user_id || viewerId === row.owner_id),
  });
  const checkinOwner = db.prepare('SELECT user_id, iata FROM checkins WHERE id = ?');
  const getComment = db.prepare(`${COMMENT_SELECT} WHERE m.id = ?`);

  function checkinOr404(raw) {
    const id = Number(raw);
    const c = Number.isInteger(id) && id > 0 ? checkinOwner.get(id) : null;
    if (!c) throw notFound('Check-in finns inte');
    return { id, ...c };
  }
  function commentOr404(raw) {
    const id = Number(raw);
    const c = Number.isInteger(id) && id > 0 ? getComment.get(id) : null;
    if (!c) throw notFound('Kommentaren finns inte');
    return c;
  }

  r.get('/checkins/:id/comments', h((req, res) => {
    const c = checkinOr404(req.params.id);
    const { limit, offset } = paging(req.query, { defLimit: 50, maxLimit: 200 });
    const rows = db.prepare(`${COMMENT_SELECT} WHERE m.checkin_id = ? ORDER BY m.id LIMIT ? OFFSET ?`).all(c.id, limit, offset);
    res.json(rows.map((row) => commentFrom(row, req.user?.id)));
  }));

  r.post('/checkins/:id/comments', requireAuth, limiters.comment, h((req, res) => {
    const c = checkinOr404(req.params.id);
    const body = cleanText(req.body?.body, { field: 'body', max: 500, required: true });
    const id = transaction(db, () => {
      const cid = Number(db.prepare('INSERT INTO comments (checkin_id, user_id, body, created_at) VALUES (?, ?, ?, ?)')
        .run(c.id, req.user.id, body, new Date().toISOString()).lastInsertRowid);
      notify(db, { userId: c.user_id, type: 'comment', actorId: req.user.id, checkinId: c.id, commentId: cid });
      awardBadges(db, req.user.id);
      return cid;
    });
    res.status(201).json(commentFrom(getComment.get(id), req.user.id));
  }));

  r.patch('/comments/:id', requireAuth, h((req, res) => {
    const c = commentOr404(req.params.id);
    if (c.user_id !== req.user.id) throw new HttpError(403, 'Du kan bara ändra dina egna kommentarer');
    const body = cleanText(req.body?.body, { field: 'body', max: 500, required: true });
    db.prepare('UPDATE comments SET body = ?, edited_at = ? WHERE id = ?').run(body, new Date().toISOString(), c.id);
    res.json(commentFrom(getComment.get(c.id), req.user.id));
  }));

  r.delete('/comments/:id', requireAuth, h((req, res) => {
    const c = commentOr404(req.params.id);
    if (c.user_id !== req.user.id && c.owner_id !== req.user.id) {
      throw new HttpError(403, 'Bara författaren eller check-in-ägaren kan radera kommentaren');
    }
    db.prepare('DELETE FROM comments WHERE id = ?').run(c.id);
    res.status(204).end();
  }));

  // ---- Notiser ----
  const unreadCount = db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0');

  r.get('/notifications', requireAuth, h((req, res) => {
    const { limit, offset } = paging(req.query, { defLimit: 30, maxLimit: 100 });
    const onlyUnread = req.query.unread === '1' || req.query.unread === 'true';
    const rows = db.prepare(`${NOTIFICATION_SELECT} WHERE n.user_id = ? ${onlyUnread ? 'AND n.read = 0' : ''}
      ORDER BY n.id DESC LIMIT ? OFFSET ?`).all(req.user.id, limit, offset);
    res.json({ items: rows.map(notificationFrom), unread: unreadCount.get(req.user.id).n });
  }));

  r.get('/notifications/unread-count', requireAuth, h((req, res) => {
    res.json({ unread: unreadCount.get(req.user.id).n });
  }));

  r.post('/notifications/read', requireAuth, h((req, res) => {
    const ids = req.body?.ids;
    if (ids === undefined || ids === null) {
      db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0').run(req.user.id);
    } else {
      if (!Array.isArray(ids) || ids.length > 500 || !ids.every((x) => Number.isInteger(x) && x > 0)) {
        throw bad('ids måste vara en lista med notis-id (max 500)');
      }
      if (ids.length) {
        db.prepare(`UPDATE notifications SET read = 1 WHERE user_id = ? AND id IN (${ids.map(() => '?').join(', ')})`)
          .run(req.user.id, ...ids);
      }
    }
    res.json({ unread: unreadCount.get(req.user.id).n });
  }));

  return r;
}
