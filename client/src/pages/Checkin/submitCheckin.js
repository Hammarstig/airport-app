import { api } from '../../lib/api.js';
import { downscaleToJpeg } from '../../lib/image.js';
import { SUB_RATINGS } from '../../lib/format.js';

/** Bygger request-body enligt API v1.2 av formulärets state. */
export function buildBody(f) {
  const subs = {};
  for (const s of SUB_RATINGS) if (f.ratings[s.key] != null) subs[s.key] = f.ratings[s.key];
  const t = f.travel;
  const body = { iata: f.airport.iata, visitedOn: f.visitedOn, kind: f.kind };
  if (f.rating != null) body.rating = f.rating;
  if (Object.keys(subs).length) body.ratings = subs;
  if (f.comment.trim()) body.comment = f.comment.trim();
  if (t.airline) body.airlineIata = t.airline.iata;
  if (t.flightNumber) body.flightNumber = t.flightNumber;
  if (t.travelClass) body.travelClass = t.travelClass;
  if (t.loungeChoice === 'new') {
    body.newLounge = {
      name: t.newLounge.name.trim(),
      ...(t.newLounge.terminal.trim() ? { terminal: t.newLounge.terminal.trim() } : {})
    };
  } else if (t.loungeChoice) {
    body.loungeId = Number(t.loungeChoice);
  }
  if (t.loungeChoice && t.loungeRating != null) body.loungeRating = t.loungeRating;
  return body;
}

/** Skapar check-in och laddar sedan upp foton ett i taget. Returnerar { checkin, failedPhotos }. */
export async function submitCheckin(f, onProgress) {
  const checkin = await api.createCheckin(buildBody(f));
  let failed = 0;
  for (let i = 0; i < f.photos.length; i++) {
    onProgress && onProgress(`Laddar upp foto ${i + 1} av ${f.photos.length}...`);
    try {
      const { blob } = await downscaleToJpeg(f.photos[i].file);
      await api.uploadPhoto(checkin.id, blob);
    } catch {
      failed++;
    }
  }
  return { checkin, failedPhotos: failed };
}
