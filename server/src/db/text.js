// Normalisering av text och landsnamn för sökning.
/** Gemener utan diakritiska tecken, för sökning ("Göteborg" -> "goteborg"). */
export function normalize(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ø/gi, 'o')
    .replace(/æ/gi, 'ae')
    .replace(/ß/g, 'ss')
    .toLowerCase();
}

/** Som normalize men skiljetecken blir mellanslag, för ord-prefixsökning ("Stockholm-Arlanda" -> "stockholm arlanda"). */
export function normalizeWords(s) {
  return normalize(s).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

const svRegion = new Intl.DisplayNames('sv', { type: 'region' });
const enRegion = new Intl.DisplayNames('en', { type: 'region' });
export function countryNameSv(code) {
  if (!code) return null;
  try { return svRegion.of(code) || code; } catch { return code; }
}
export function countrySearch(code) {
  if (!code) return '';
  let en = code;
  try { en = enRegion.of(code) || code; } catch { /* okänd kod */ }
  return normalizeWords(`${countryNameSv(code)} ${en}`);
}

