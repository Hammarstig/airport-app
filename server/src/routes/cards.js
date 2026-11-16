// Delningskort (SVG 1200x630) för flygplatser och check-ins, används som og:image.
import { Router } from 'express';
import { h, notFound, normIata } from '../util.js';
import { airportCardSvg, checkinCardSvg } from '../og.js';

export default function cardRoutes({ db }) {
  const r = Router();
  const send = (res, svg) => {
    res.set({ 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=300' });
    res.send(svg);
  };
  r.get('/airports/:iata/card.svg', h((req, res) => {
    const svg = airportCardSvg(db, normIata(req.params.iata));
    if (!svg) throw notFound('Flygplatsen finns inte (okänd IATA-kod)');
    send(res, svg);
  }));
  r.get('/checkins/:id/card.svg', h((req, res) => {
    const id = Number(req.params.id);
    const svg = Number.isInteger(id) && id > 0 ? checkinCardSvg(db, id) : null;
    if (!svg) throw notFound('Check-in finns inte');
    send(res, svg);
  }));
  return r;
}
