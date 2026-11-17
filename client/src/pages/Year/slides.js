// Bildspelet "Ditt <år>": data per bild (tema, texter) som både DOM-vyn och den delbara bilden ritar.

const MONTHS = [
  'Januari',
  'Februari',
  'Mars',
  'April',
  'Maj',
  'Juni',
  'Juli',
  'Augusti',
  'September',
  'Oktober',
  'November',
  'December'
];

const pct = (n) => `${String(n ?? 0).replace('.', ',')} %`;
const plural = (n, one, many) => (n === 1 ? one : many);
const listNames = (arr) =>
  arr.length <= 1 ? arr.join('') : `${arr.slice(0, -1).join(', ')} och ${arr[arr.length - 1]}`;

/** Bygger bilderna av svaret från GET /users/:u/year/:year. */
export function buildSlides(d, year) {
  if (!d || !d.checkins) {
    return [
      {
        id: 'empty',
        theme: 'night',
        kicker: `Ditt ${year}`,
        big: '0',
        label: 'check-ins än',
        text: 'Checka in på en flygplats så fylls din årsöversikt på.'
      }
    ];
  }
  const slides = [];
  slides.push({
    id: 'airports',
    theme: 'night',
    kicker: `${year} besökte du`,
    big: String(d.uniqueAirports),
    label: plural(d.uniqueAirports, 'flygplats', 'flygplatser'),
    text: `${d.newAirports} av dem för första gången, på ${d.checkins} ${plural(d.checkins, 'check-in', 'check-ins')}.`
  });
  if (d.topAirport) {
    const a = d.topAirport.airport;
    slides.push({
      id: 'top',
      theme: 'signal',
      kicker: 'Din mest besökta',
      code: a.iata,
      label: a.city || a.name,
      text: `${d.topAirport.visits} ${plural(d.topAirport.visits, 'besök', 'besök')} på ${a.name}.`
    });
  }
  if (d.topCountries?.length) {
    slides.push({
      id: 'countries',
      theme: 'plum',
      kicker: `Topp ${d.topCountries.length} ${plural(d.topCountries.length, 'land', 'länder')}`,
      list: d.topCountries.map((c) => [c.name, c.airports]),
      stats: [
        [d.countries, plural(d.countries, 'land', 'länder')],
        [d.continents, plural(d.continents, 'kontinent', 'kontinenter')],
        [d.longestStreak ?? 0, 'veckor i rad'],
        [pct(d.worldPct), 'av världen']
      ]
    });
  }
  const busiest = [...(d.months || [])].sort((a, z) => z.checkins - a.checkins)[0];
  if (busiest?.checkins) {
    const newC = (d.newCountries || []).map((c) => c.name);
    slides.push({
      id: 'month',
      theme: 'green',
      kicker: 'Din mest intensiva månad',
      big: String(busiest.checkins),
      label: MONTHS[Number(busiest.month.slice(5)) - 1],
      text:
        `${busiest.checkins} ${plural(busiest.checkins, 'check-in', 'check-ins')} och ${busiest.newAirports} ${plural(busiest.newAirports, 'ny flygplats', 'nya flygplatser')}.` +
        (newC.length ? ` Nya länder i år: ${listNames(newC.slice(0, 4))}${newC.length > 4 ? ' m.fl.' : ''}.` : '')
    });
  }
  if (d.favoriteAirport) {
    const a = d.favoriteAirport.airport;
    slides.push({
      id: 'favorite',
      theme: 'night',
      kicker: 'Ditt högst betygsatta',
      code: a.iata,
      label: a.city || a.name,
      text: `Snittbetyg ${String(d.favoriteAirport.avgRating).replace('.', ',')} av 5 på ${d.favoriteAirport.checkins} ${plural(d.favoriteAirport.checkins, 'besök', 'besök')}.`
    });
  }
  if (d.badgesEarned?.length || d.challengesCompleted) {
    const n = d.badgesEarned?.length || 0;
    slides.push({
      id: 'badges',
      theme: 'plum',
      kicker: 'Upplåst i år',
      big: String(n),
      label: plural(n, 'märke', 'märken'),
      text:
        (n ? `Bland annat ${listNames(d.badgesEarned.slice(0, 3).map((b) => b.name))}. ` : '') +
        `${d.challengesCompleted || 0} ${plural(d.challengesCompleted || 0, 'utmaning', 'utmaningar')} klarade.`
    });
  }
  const codes = [
    ...new Set(
      [d.firstCheckin, d.topAirport, d.favoriteAirport, d.lastCheckin].filter(Boolean).map((x) => x.airport.iata)
    )
  ];
  slides.push({
    id: 'codes',
    theme: 'sky',
    kicker: 'Ditt år i koder',
    codes,
    label: `Vi ses ${year + 1}`
  });
  return slides;
}

// Färger per tema (samma som .wrapped-slide--* i moments.css).
export const THEMES = {
  night: { bg1: '#0B1525', bg2: '#1E3654', fg: '#FFFFFF', hi: '#FFC629' },
  sky: { bg1: '#BFE3FF', bg2: '#F3F9FF', fg: '#14263C', hi: '#C2410C' },
  signal: { bg1: '#FFB81C', bg2: '#FFE08A', fg: '#1E1600', hi: '#14263C' },
  plum: { bg1: '#2A0F33', bg2: '#6B2E8C', fg: '#FFFFFF', hi: '#FFE08A' },
  green: { bg1: '#0E3B2A', bg2: '#1D7A4C', fg: '#FFFFFF', hi: '#FFE08A' }
};
