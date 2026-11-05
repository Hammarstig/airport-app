export const KINDS = [
  { value: 'departure', label: 'Avgång' },
  { value: 'arrival', label: 'Ankomst' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'layover', label: 'Mellanlandning' }
];

export const KIND_LABEL = Object.fromEntries(KINDS.map((k) => [k.value, k.label]));

export const SUB_RATINGS = [
  { key: 'security', label: 'Säkerhetskontroll' },
  { key: 'cleanliness', label: 'Renlighet' },
  { key: 'food', label: 'Mat' },
  { key: 'wifi', label: 'Wifi' },
  { key: 'transfer', label: 'Transfer' },
  { key: 'lounges', label: 'Lounger' }
];

const CONTINENTS = {
  AF: 'Afrika',
  AN: 'Antarktis',
  AS: 'Asien',
  EU: 'Europa',
  NA: 'Nordamerika',
  OC: 'Oceanien',
  SA: 'Sydamerika'
};

export function continentName(code) {
  return CONTINENTS[code] || code || '';
}

let regionNames = null;
try {
  regionNames = new Intl.DisplayNames(['sv'], { type: 'region' });
} catch {
  regionNames = null;
}

export function countryName(code) {
  if (!code) return '';
  try {
    return (regionNames && regionNames.of(code)) || code;
  } catch {
    return code;
  }
}

export function todayIso() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const dateFmt = new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' });

export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return dateFmt.format(d);
}

export function formatRating(r) {
  if (r === null || r === undefined) return '-';
  return Number(r).toLocaleString('sv-SE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function ratingTone(r) {
  if (r === null || r === undefined) return '';
  if (r >= 4) return 'good';
  if (r >= 2.5) return 'mid';
  return 'bad';
}

export function hueFor(text = '') {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 360;
  return h;
}

export function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function placeLine(airport) {
  if (!airport) return '';
  return [airport.city, countryName(airport.country)].filter(Boolean).join(', ');
}

export const CONTINENT_CODES = ['EU', 'NA', 'AS', 'SA', 'AF', 'OC'];

export const AIRPORT_TYPES = [
  { value: 'large', label: 'Stor' },
  { value: 'medium', label: 'Mellan' },
  { value: 'small', label: 'Liten' }
];

export const CATEGORIES = [{ key: 'overall', label: 'Totalbetyg' }, ...SUB_RATINGS];

export function categoryLabel(key) {
  const c = CATEGORIES.find((x) => x.key === key);
  return c ? c.label : key;
}

export const COUNTRY_CHOICES = [
  'SE',
  'NO',
  'DK',
  'FI',
  'IS',
  'DE',
  'GB',
  'IE',
  'NL',
  'BE',
  'FR',
  'ES',
  'PT',
  'IT',
  'CH',
  'AT',
  'PL',
  'GR',
  'US',
  'CA',
  'MX',
  'BR',
  'AE',
  'QA',
  'TR',
  'SG',
  'JP',
  'KR',
  'CN',
  'HK',
  'AU',
  'NZ',
  'TH',
  'IN',
  'ZA'
];

export function sortedCountryOptions(codes = COUNTRY_CHOICES) {
  return codes.map((c) => ({ value: c, label: countryName(c) })).sort((a, b) => a.label.localeCompare(b.label, 'sv'));
}

export const TRAVEL_CLASSES = [
  { value: 'economy', label: 'Ekonomi' },
  { value: 'premium_economy', label: 'Premium ekonomi' },
  { value: 'business', label: 'Business' },
  { value: 'first', label: 'First' }
];

export const CLASS_LABEL = Object.fromEntries(TRAVEL_CLASSES.map((c) => [c.value, c.label]));

export const MATCHED_ON_LABEL = {
  iata: 'IATA-kod',
  icao: 'ICAO-kod',
  city: 'Stad',
  name: 'Flygplatsnamn',
  country: 'Land'
};
