import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { h, notFound, cleanText, validateHalfStep, validateDate, USER_COLS, userFrom } from '../util.js';
import { LOUNGE_SELECT, loungeFrom } from './airports.js';

const REVIEW_SELECT = `
  SELECT r.id, r.lounge_id, r.rating, r.comment, r.visited_on, r.created_at, ${USER_COLS('u', 'u_')}
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

export default function loungeRoutes({ db }) {
  const r = Router();
  const getLounge = db.prepare(`${LOUNGE_SELECT} WHERE lo.id = ?`);

  function loungeOr404(idRaw) {
    const id = Number(idRaw);
    const row = Number.isInteger(id) && id > 0 ? getLounge.get(id) : null;
    if (!row) throw notFound('Loungen finns inte');
    return row;
  }

  r.get('/lounges/:id', h((req, res) => {
    const lo = loungeOr404(req.params.id);
    const reviews = db.prepare(`${REVIEW_SELECT} WHERE r.lounge_id = ? ORDER BY r.created_at DESC, r.id DESC`).all(lo.id);
    res.json({ ...loungeFrom(lo), reviews: reviews.map(reviewFrom) });
  }));

  r.post('/lounges/:id/reviews', requireAuth, h((req, res) => {
    const lo = loungeOr404(req.params.id);
    const b = req.body ?? {};
    const rating = validateHalfStep(b.rating, { field: 'rating', min: 1, max: 5, required: true });
    const comment = cleanText(b.comment, { field: 'comment', max: 1000 });
    const visitedOn = validateDate(b.visitedOn);
    const info = db.prepare(`INSERT INTO lounge_reviews (lounge_id, user_id, rating, comment, visited_on, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`).run(lo.id, req.user.id, rating, comment, visitedOn, new Date().toISOString());
    const row = db.prepare(`${REVIEW_SELECT} WHERE r.id = ?`).get(Number(info.lastInsertRowid));
    res.status(201).json(reviewFrom(row));
  }));

  return r;
}
