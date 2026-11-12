// Följa (med förfrågningar för privata profiler), kommentarer, notiser, blockering och rapporter.
import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { h, bad, notFound, HttpError, cleanText, paging, enumParam, USER_COLS, userFrom } from '../util.js';
import { transaction } from '../db/index.js';
import { notify, NOTIFICATION_SELECT, notificationFrom } from '../notify.js';
import { awardBadges } from '../badges.js';
import { visibleCheckin, commentVisible, isBlocked, requireProfileAccess } from '../visibility.js';

const REPORT_TYPES = ['user', 'comment', 'checkin'];
const REPORT_REASONS = ['spam', 'harassment', 'inappropriate', 'privacy', 'other'];
const REPORT_STATUSES = ['open', 'resolved', 'dismissed'];

export default function socialRoutes({ db, limiters, config, photos }) {
  const r = Router();
  const moderators = new Set(config?.moderators ?? []);
  const userByName = db.prepare('SELECT id, username, is_private FROM users WHERE username = ?');
  const followerCount = db.prepare("SELECT COUNT(*) AS n FROM follows WHERE followee_id = ? AND status = 'accepted'");

  function userOr404(raw) {
    const u = userByName.get(String(raw).toLowerCase());
    if (!u) throw notFound('Användaren finns inte');
    return u;
  }

  // ---- Följa ----
  r.post('/users/:username/follow', requireAuth, limiters.follow, h((req, res) => {
    const u = userOr404(req.params.username);
    if (u.id === req.user.id) throw bad('Du kan inte följa dig själv');
    if (isBlocked(db, req.user.id, u.id)) throw new HttpError(403, 'Du kan inte följa den här användaren');
    const status = u.is_private ? 'pending' : 'accepted';
    transaction(db, () => {
      const info = db.prepare('INSERT OR IGNORE INTO follows (follower_id, followee_id, created_at, status) VALUES (?, ?, ?, ?)')
        .run(req.user.id, u.id, new Date().toISOString(), status);
      if (info.changes) notify(db, { userId: u.id, type: status === 'pending' ? 'follow_request' : 'follow', actorId: req.user.id });
    });
    const f = db.prepare('SELECT status FROM follows WHERE follower_id = ? AND followee_id = ?').get(req.user.id, u.id);
    res.json({ following: f.status === 'accepted', requested: f.status === 'pending', followers: followerCount.get(u.id).n });
  }));

  r.delete('/users/:username/follow', requireAuth, h((req, res) => {
    const u = userOr404(req.params.username);
    db.prepare('DELETE FROM follows WHERE follower_id = ? AND followee_id = ?').run(req.user.id, u.id);
    res.json({ following: false, requested: false, followers: followerCount.get(u.id).n });
  }));

  const followList = (column, other) => h((req, res) => {
    const u = userOr404(req.params.username);
    requireProfileAccess(db, req.user?.id, db.prepare('SELECT * FROM users WHERE id = ?').get(u.id));
    const { limit, offset } = paging(req.query, { defLimit: 50, maxLimit: 200 });
    const rows = db.prepare(`SELECT ${USER_COLS('x', '')},
        EXISTS (SELECT 1 FROM follows m WHERE m.follower_id = ? AND m.followee_id = x.id AND m.status = 'accepted') AS followed_by_me
      FROM follows f JOIN users x ON x.id = f.${other}
      WHERE f.${column} = ? AND f.status = 'accepted' ORDER BY f.created_at DESC, x.username LIMIT ? OFFSET ?`)
      .all(req.user?.id ?? -1, u.id, limit, offset);
    res.json(rows.map((row) => ({ ...userFrom(row), followedByMe: !!row.followed_by_me })));
  });
  r.get('/users/:username/followers', followList('followee_id', 'follower_id'));
  r.get('/users/:username/following', followList('follower_id', 'followee_id'));

  // Förfrågningar till en privat profil
  r.get('/me/follow-requests', requireAuth, h((req, res) => {
    const rows = db.prepare(`SELECT ${USER_COLS('x', '')}, f.created_at FROM follows f JOIN users x ON x.id = f.follower_id
      WHERE f.followee_id = ? AND f.status = 'pending' ORDER BY f.created_at DESC`).all(req.user.id);
    res.json(rows.map((row) => ({ ...userFrom(row), requestedAt: row.created_at })));
  }));

  r.post('/me/follow-requests/:username', requireAuth, h((req, res) => {
    const u = userOr404(req.params.username);
    transaction(db, () => {
      const info = db.prepare("UPDATE follows SET status = 'accepted' WHERE follower_id = ? AND followee_id = ? AND status = 'pending'")
        .run(u.id, req.user.id);
      if (!info.changes) throw notFound('Förfrågan finns inte');
      notify(db, { userId: u.id, type: 'follow_accepted', actorId: req.user.id });
    });
    res.status(204).end();
  }));

  r.delete('/me/follow-requests/:username', requireAuth, h((req, res) => {
    const u = userOr404(req.params.username);
    const info = db.prepare("DELETE FROM follows WHERE follower_id = ? AND followee_id = ? AND status = 'pending'").run(u.id, req.user.id);
    if (!info.changes) throw notFound('Förfrågan finns inte');
    res.status(204).end();
  }));

  // ---- Blockera ----
  r.post('/users/:username/block', requireAuth, h((req, res) => {
    const u = userOr404(req.params.username);
    if (u.id === req.user.id) throw bad('Du kan inte blockera dig själv');
    transaction(db, () => {
      db.prepare('INSERT OR IGNORE INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)').run(req.user.id, u.id, new Date().toISOString());
      db.prepare('DELETE FROM follows WHERE (follower_id = ? AND followee_id = ?) OR (follower_id = ? AND followee_id = ?)')
        .run(req.user.id, u.id, u.id, req.user.id);
      db.prepare('DELETE FROM notifications WHERE user_id = ? AND actor_id = ?').run(req.user.id, u.id);
    });
    res.status(204).end();
  }));

  r.delete('/users/:username/block', requireAuth, h((req, res) => {
    const u = userOr404(req.params.username);
    db.prepare('DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?').run(req.user.id, u.id);
    res.status(204).end();
  }));

  r.get('/me/blocks', requireAuth, h((req, res) => {
    const rows = db.prepare(`SELECT ${USER_COLS('x', '')}, b.created_at FROM blocks b JOIN users x ON x.id = b.blocked_id
      WHERE b.blocker_id = ? ORDER BY b.created_at DESC`).all(req.user.id);
    res.json(rows.map((row) => ({ ...userFrom(row), blockedAt: row.created_at })));
  }));

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
  const getComment = db.prepare(`${COMMENT_SELECT} WHERE m.id = ?`);

  function checkinOr404(raw, viewerId) {
    const id = Number(raw);
    const c = Number.isInteger(id) && id > 0 ? visibleCheckin(db, viewerId, id) : null;
    if (!c) throw notFound('Check-in finns inte');
    return c;
  }
  function commentOr404(raw) {
    const id = Number(raw);
    const c = Number.isInteger(id) && id > 0 ? getComment.get(id) : null;
    if (!c) throw notFound('Kommentaren finns inte');
    return c;
  }

  r.get('/checkins/:id/comments', h((req, res) => {
    const c = checkinOr404(req.params.id, req.user?.id);
    const { limit, offset } = paging(req.query, { defLimit: 50, maxLimit: 200 });
    const vis = commentVisible(req.user?.id);
    const rows = db.prepare(`${COMMENT_SELECT} WHERE m.checkin_id = ? AND ${vis.sql} ORDER BY m.id LIMIT ? OFFSET ?`)
      .all(c.id, ...vis.params, limit, offset);
    res.json(rows.map((row) => commentFrom(row, req.user?.id)));
  }));

  r.post('/checkins/:id/comments', requireAuth, limiters.comment, h((req, res) => {
    const c = checkinOr404(req.params.id, req.user.id);
    const body = cleanText(req.body?.body, { field: 'body', max: 500, required: true });
    const id = transaction(db, () => {
      const cid = Number(db.prepare('INSERT INTO comments (checkin_id, user_id, body, created_at) VALUES (?, ?, ?, ?)')
        .run(c.id, req.user.id, body, new Date().toISOString()).lastInsertRowid);
      notify(db, { userId: c.user_id, type: 'comment', actorId: req.user.id, checkinId: c.id, commentId: cid });
      awardBadges(db, req.user.id, `badge:comment:${cid}`);
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

  // ---- Rapporter och moderering ----
  /** Slår upp rapportens mål; användare anges med användarnamn, övriga med id. */
  function reportTarget(type, target, viewerId) {
    if (type === 'user') {
      const u = typeof target === 'string' ? userByName.get(target.toLowerCase()) : null;
      if (!u) throw notFound('Användaren finns inte');
      if (u.id === viewerId) throw bad('Du kan inte rapportera dig själv');
      return u.id;
    }
    const id = Number(target);
    if (!Number.isInteger(id) || id < 1) throw bad('target måste vara ett id');
    if (type === 'comment') {
      if (!getComment.get(id)) throw notFound('Kommentaren finns inte');
    } else if (!visibleCheckin(db, viewerId, id)) {
      throw notFound('Check-in finns inte');
    }
    return id;
  }

  r.post('/reports', requireAuth, h((req, res) => {
    const b = req.body ?? {};
    const type = enumParam(b, 'type', REPORT_TYPES, undefined);
    const reason = enumParam(b, 'reason', REPORT_REASONS, undefined);
    if (!type || !reason) throw new HttpError(400, 'type och reason krävs', { allowed: { type: REPORT_TYPES, reason: REPORT_REASONS } });
    const targetId = reportTarget(type, b.target, req.user.id);
    const note = cleanText(b.note, { field: 'note', max: 500 });
    const existing = db.prepare("SELECT id FROM reports WHERE reporter_id = ? AND type = ? AND target_id = ? AND status = 'open'")
      .get(req.user.id, type, targetId);
    if (existing) return res.json({ id: existing.id, status: 'open' });
    const info = db.prepare('INSERT INTO reports (reporter_id, type, target_id, reason, note, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(req.user.id, type, targetId, reason, note, new Date().toISOString());
    res.status(201).json({ id: Number(info.lastInsertRowid), status: 'open' });
  }));

  function requireModerator(req, _res, next) {
    if (!req.user || !moderators.has(req.user.username)) return next(new HttpError(403, 'Kräver moderator'));
    next();
  }

  const reportFrom = (row) => {
    let target = { id: row.target_id };
    if (row.type === 'user') {
      const u = db.prepare('SELECT username, display_name FROM users WHERE id = ?').get(row.target_id);
      target = { id: row.target_id, username: u?.username ?? null, displayName: u?.display_name ?? null };
    } else if (row.type === 'comment') {
      const c = db.prepare('SELECT m.body, u.username FROM comments m JOIN users u ON u.id = m.user_id WHERE m.id = ?').get(row.target_id);
      target = { id: row.target_id, body: c?.body ?? null, author: c?.username ?? null, exists: !!c };
    } else {
      const c = db.prepare('SELECT c.iata, c.comment, u.username FROM checkins c JOIN users u ON u.id = c.user_id WHERE c.id = ?').get(row.target_id);
      target = { id: row.target_id, iata: c?.iata ?? null, comment: c?.comment ?? null, author: c?.username ?? null, exists: !!c };
    }
    return {
      id: row.id, type: row.type, target, reason: row.reason, note: row.note ?? null,
      reporter: row.reporter ?? null, status: row.status, reportCount: row.report_count, createdAt: row.created_at,
    };
  };
  const REPORT_SELECT = `SELECT r.*, ru.username AS reporter,
    (SELECT COUNT(*) FROM reports x WHERE x.type = r.type AND x.target_id = r.target_id) AS report_count
    FROM reports r LEFT JOIN users ru ON ru.id = r.reporter_id`;

  r.get('/moderation/reports', requireAuth, requireModerator, h((req, res) => {
    const status = enumParam(req.query, 'status', REPORT_STATUSES, 'open');
    const { limit, offset } = paging(req.query, { defLimit: 50, maxLimit: 200 });
    const rows = db.prepare(`${REPORT_SELECT} WHERE r.status = ? ORDER BY r.id DESC LIMIT ? OFFSET ?`).all(status, limit, offset);
    res.json(rows.map(reportFrom));
  }));

  r.post('/moderation/reports/:id', requireAuth, requireModerator, h((req, res) => {
    const id = Number(req.params.id);
    const rep = Number.isInteger(id) ? db.prepare('SELECT * FROM reports WHERE id = ?').get(id) : null;
    if (!rep) throw notFound('Rapporten finns inte');
    const action = enumParam(req.body ?? {}, 'action', ['dismiss', 'resolve', 'remove_content'], undefined);
    if (!action) throw new HttpError(400, 'action krävs', { allowed: ['dismiss', 'resolve', 'remove_content'] });
    if (action === 'remove_content' && rep.type === 'user') throw bad('remove_content gäller kommentarer och check-ins');
    const files = action === 'remove_content' && rep.type === 'checkin'
      ? db.prepare('SELECT filename FROM photos WHERE checkin_id = ?').all(rep.target_id).map((p) => p.filename) : [];
    transaction(db, () => {
      if (action === 'remove_content') {
        db.prepare(`DELETE FROM ${rep.type === 'comment' ? 'comments' : 'checkins'} WHERE id = ?`).run(rep.target_id);
      }
      // Alla öppna rapporter för samma mål avslutas samtidigt.
      db.prepare("UPDATE reports SET status = ?, resolved_by = ?, resolved_at = ? WHERE type = ? AND target_id = ? AND status = 'open'")
        .run(action === 'dismiss' ? 'dismissed' : 'resolved', req.user.id, new Date().toISOString(), rep.type, rep.target_id);
    });
    photos?.removeFiles(files);
    res.json(reportFrom(db.prepare(`${REPORT_SELECT} WHERE r.id = ?`).get(id)));
  }));

  return r;
}
