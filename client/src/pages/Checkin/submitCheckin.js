import { api } from '../../lib/api.js';
import { downscaleToJpeg } from '../../lib/image.js';
import { SUB_RATINGS } from '../../lib/format.js';
import { enqueue, isNetworkError } from '../../lib/offlineQueue.js';

/**
 * Bygger request-body av formulärets state. patch=true ger body för PATCH /checkins/:id:
 * tomma valfria fält skickas som null (töms), och iata/ny lounge/loungebetyg utelämnas.
 */
export function buildBody(f, patch = false) {
  if (patch) {
    const subs = {};
    for (const s of SUB_RATINGS) if (f.ratings[s.key] != null) subs[s.key] = f.ratings[s.key];
    const t = f.travel;
    const lounge = t.loungeChoice && t.loungeChoice !== 'new' ? Number(t.loungeChoice) : null;
    return {
      visitedOn: f.visitedOn,
      kind: f.kind,
      rating: f.rating ?? null,
      ratings: subs,
      comment: f.comment.trim() || null,
      airlineIata: t.airline ? t.airline.iata : null,
      flightNumber: t.flightNumber || null,
      travelClass: t.travelClass || null,
      loungeId: lounge
    };
  }
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

async function shrinkAll(photos, onProgress) {
  const blobs = [];
  let failed = 0;
  for (let i = 0; i < photos.length; i++) {
    onProgress && onProgress(`Förbereder foto ${i + 1} av ${photos.length}...`);
    try {
      blobs.push((await downscaleToJpeg(photos[i].file)).blob);
    } catch (e) {
      console.warn('Foto kunde inte skalas ner:', e.message);
      failed++;
    }
  }
  return { blobs, failed };
}

/**
 * Skapar check-in och laddar upp foton. Utan nät (eller om anropet inte når servern) läggs
 * check-in:en i offlinekön. Returnerar { checkin, failedPhotos } eller { queued: true }.
 */
export async function submitCheckin(f, onProgress) {
  const body = buildBody(f);
  const { blobs, failed: shrinkFailed } = await shrinkAll(f.photos, onProgress);
  const queue = async () => {
    await enqueue({ body, photos: blobs, airport: f.airport });
    return { queued: true, failedPhotos: shrinkFailed };
  };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return queue();

  onProgress && onProgress('Sparar...');
  let checkin;
  try {
    checkin = await api.createCheckin(body);
  } catch (e) {
    if (isNetworkError(e)) return queue();
    throw e;
  }
  let failed = shrinkFailed;
  for (let i = 0; i < blobs.length; i++) {
    onProgress && onProgress(`Laddar upp foto ${i + 1} av ${blobs.length}...`);
    try {
      await api.uploadPhoto(checkin.id, blobs[i]);
    } catch (e) {
      console.warn('Foto kunde inte laddas upp:', e.message);
      failed++;
    }
  }
  return { checkin, failedPhotos: failed };
}

/** Sparar ändringar i en befintlig check-in, laddar upp nya foton och tar bort borttagna. */
export async function saveEdit(id, f, removedPhotoIds, onProgress) {
  const checkin = await api.updateCheckin(id, buildBody(f, true));
  let failed = 0;
  for (const pid of removedPhotoIds) {
    try {
      await api.deletePhoto(pid);
    } catch (e) {
      console.warn('Foto kunde inte tas bort:', e.message);
      failed++;
    }
  }
  const { blobs, failed: shrinkFailed } = await shrinkAll(f.photos, onProgress);
  for (const blob of blobs) {
    try {
      await api.uploadPhoto(id, blob);
    } catch (e) {
      console.warn('Foto kunde inte laddas upp:', e.message);
      failed++;
    }
  }
  return { checkin, failedPhotos: failed + shrinkFailed };
}
