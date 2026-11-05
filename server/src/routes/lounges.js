import { Router } from 'express';
import { requireAuth } from '../auth.js';
import {
  h, notFound, HttpError, cleanText, validateHalfStep, validateDate, paging, USER_COLS, userFrom,
  LOUNGE_SELECT, loungeFrom,
} from '../util.js';
import { transaction } from '../db.js';
import { awardBadges } from '../badges.js';

const REVIEW_SELECT = `
  SELECT r.id, r.lounge_id, r.user_id, r.rating, r.comment, r.visited_on, r.created_at, ${USER_COLS('u', 'u_')}
  FROM lounge_reviews r JOIN users u ON u.id = r.user_id`;

function reviewFrom(row) {
  return {
    id: row.id,
    loungeId: row.lounge_id,
    user: userFrom(row, 'u_'),
    rating: row.rating,
    comment: row.comment ?? null,
    visitedOn: row.visited_on,
    createdAt: row.created_at,
  };
}

export default function loungeRoutes({ db, limiters }) {
  const r = Router();
  const getLounge = db.prepare(`${LOUNGE_SELECT} WHERE lo.id = ?`);
  const getReview = db.prepare(`${REVIEW_SELECT} WHERE r.id = ?`);

  function loungeOr404(idRaw) {
    const id = Number(idRaw);
    const row = Number.isInteger(id) && id > 0 ? getLounge.get(id) : null;
    if (!row) throw notFound('Loungen finns inte');
    return row;
  }
  function ownReviewOr404(idRaw, userId) {
    const id = Number(idRaw);
    const row = Number.isInteger(id) && id > 0 ? getReview.get(id) : null;
    if (!row) throw notFound('Recensionen finns inte');
    if (row.user_id !== userId) throw new HttpError(403, 'Du kan bara ändra dina egna recensioner');
    return row;
  }

  r.get('/lounges/:id', h((req, res) => {
    const lo = loungeOr404(req.params.id);
    const { limit, offset } = paging(req.query, { defLimit: 20, maxLimit: 100 });
    const reviews = db.prepare(`${REVIEW_SELECT} WHERE r.lounge_id = ? ORDER BY r.created_at DESC, r.id DESC LIMIT ? OFFSET ?`)
      .all(lo.id, limit, offset);
    res.json({ ...loungeFrom(lo), reviews: reviews.map(reviewFrom) });
  }));

  r.post('/lounges/:id/reviews', requireAuth, limiters.review, h((req, res) => {
    const lo = loungeOr404(req.params.id);
    const b = req.body ?? {};
    const rating = validateHalfStep(b.rating, { field: 'rating', min: 1, max: 5, required: true });
    const comment = cleanText(b.comment, { field: 'comment', max: 1000 });
    const visitedOn = validateDate(b.visitedOn);
    const id = transaction(db, () => {
      const rid = Number(db.prepare(`INSERT INTO lounge_reviews (lounge_id, user_id, rating, comment, visited_on, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`).run(lo.id, req.user.id, rating, comment, visitedOn, new Date().toISOString()).lastInsertRowid);
      awardBadges(db, req.user.id);
      return rid;
    });
    res.status(201).json(reviewFrom(getReview.get(id)));
  }));

  r.patch('/lounge-reviews/:id', requireAuth, h((req, res) => {
    const cur = ownReviewOr404(req.params.id, req.user.id);
    const b = req.body ?? {};
    const rating = b.rating !== undefined ? validateHalfStep(b.rating, { field: 'rating', min: 1, max: 5, required: true }) : cur.rating;
    const comment = b.comment !== undefined ? cleanText(b.comment, { field: 'comment', max: 1000 }) : cur.comment;
    const visitedOn = b.visitedOn !== undefined ? validateDate(b.visitedOn) : cur.visited_on;
    db.prepare('UPDATE lounge_reviews SET rating = ?, comment = ?, visited_on = ? WHERE id = ?').run(rating, comment, visitedOn, cur.id);
    res.json(reviewFrom(getReview.get(cur.id)));
  }));

  r.delete('/lounge-reviews/:id', requireAuth, h((req, res) => {
    const cur = ownReviewOr404(req.params.id, req.user.id);
    db.prepare('DELETE FROM lounge_reviews WHERE id = ?').run(cur.id);
    res.status(204).end();
  }));

  return r;
}
