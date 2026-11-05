import { feature } from 'topojson-client';
import { geoArea } from 'd3-geo';
import { featureAlpha2 } from '../../lib/iso.js';

// Kartdata laddas bara här (egen chunk) och bara en gång per sidvisning.
let world110 = null;
let world50 = null;

function toFeatures(topo) {
  const fc = feature(topo, topo.objects.countries);
  return fc.features.map((f) => ({ ...f, alpha2: featureAlpha2(f) }));
}

/** Översiktskarta (110m, ca 30 kB gzip). */
export function loadWorld() {
  world110 ||= import('world-atlas/countries-110m.json').then((m) => toFeatures(m.default));
  return world110;
}

/** Detaljerad karta för landsvyn (50m) - inkluderar även små länder och öar. */
export function loadDetailed() {
  world50 ||= import('world-atlas/countries-50m.json').then((m) => toFeatures(m.default));
  return world50;
}

/**
 * Landsformer för landsvyn. Stora länder räcker med 110m-kartan (redan laddad);
 * små länder och öar hämtas ur 50m-kartan (större fil, laddas bara vid behov).
 */
export async function loadCountryShapes(code) {
  const coarse = (await loadWorld()).filter((f) => f.alpha2 === code);
  const area = coarse.reduce((n, f) => n + geoArea(f), 0);
  if (coarse.length && area > 0.04) return coarse;
  return (await loadDetailed()).filter((f) => f.alpha2 === code);
}

/** Färgsteg 0-6 för täckningsgrad i procent (0 = obesökt). */
export function coverageStep(visited, pct) {
  if (!visited) return 0;
  if (pct < 5) return 1;
  if (pct < 10) return 2;
  if (pct < 25) return 3;
  if (pct < 50) return 4;
  if (pct < 75) return 5;
  return 6;
}

export const STEP_LABELS = ['<5 %', '5-10 %', '10-25 %', '25-50 %', '50-75 %', '75-100 %'];
