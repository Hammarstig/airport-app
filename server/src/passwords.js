// Lösenordspolicy: längd, inte användarnamnet och inte bland de vanligaste läckta lösenorden.
import { bad } from './util.js';

// Ett urval av de vanligaste lösenorden i publika läckor (minst 8 tecken, gemener jämförs).
const COMMON = new Set([
  '12345678', '123456789', '1234567890', '12345678910', '11111111', '00000000', '88888888', '87654321',
  'password', 'password1', 'password123', 'passw0rd', 'p@ssw0rd', 'qwertyui', 'qwerty123', 'qwertyuiop',
  'iloveyou', 'sunshine', 'princess', 'football', 'baseball', 'welcome1', 'welcome123', 'abc12345',
  'abcd1234', 'admin123', 'administrator', 'letmein1', 'trustno1', 'superman', 'starwars', 'whatever',
  'computer', 'internet', 'michelle', 'jennifer', 'charlie1', 'liverpool', 'chelsea1', 'arsenal1',
  'zaq12wsx', '1qaz2wsx', 'q1w2e3r4', '1q2w3e4r', 'asdfghjk', 'asdf1234', 'zxcvbnm1', 'monkey12',
  'dragon12', 'master12', 'shadow12', 'killer12', 'hello123', 'freedom1', 'changeme', 'secret12',
  'lösenord', 'losenord', 'losenord1', 'sommar2024', 'sommar2025', 'sommar2026', 'vinter2026',
  'hejsan123', 'qwertyasdf', 'gatelog1', 'gatelog123', 'flygplats', 'airplane',
]);

// Vanliga stammar som i läckor kombineras med siffror, årtal eller tecken (SEC-12):
// "Summer2026", "football1", "Welcome2026!", "p@ssw0rd99".
const COMMON_BASES = new Set([
  'password', 'pass', 'qwerty', 'qwertyuiop', 'qwertz', 'azerty', 'asdf', 'asdfgh', 'zxcvbnm', 'abc', 'abcd', 'abcdef',
  'iloveyou', 'loveyou', 'love', 'sunshine', 'princess', 'football', 'baseball', 'soccer', 'hockey', 'welcome', 'letmein',
  'monkey', 'dragon', 'master', 'shadow', 'superman', 'batman', 'starwars', 'pokemon', 'summer', 'winter', 'spring',
  'autumn', 'sommar', 'vinter', 'varen', 'hosten', 'admin', 'login', 'hello', 'freedom', 'whatever', 'trustno',
  'michael', 'jessica', 'charlie', 'liverpool', 'chelsea', 'arsenal', 'losenord', 'hejsan', 'changeme', 'secret',
  'test', 'guest', 'flower', 'killer', 'cheese', 'computer', 'internet', 'mustang', 'jordan', 'access',
  'january', 'february', 'march', 'april', 'june', 'july', 'august', 'september', 'october',
  'november', 'december', 'monday', 'friday',
]);
const LEET = { '@': 'a', 4: 'a', 3: 'e', 1: 'i', '!': 'i', 0: 'o', $: 's', 5: 's', 7: 't' };
function commonBase(p) {
  const tail = /^(.*?)[\d\W_]*$/u.exec(p)[1];
  const base = tail.replace(/[@4310!$57]/g, (ch) => LEET[ch] ?? ch).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return COMMON_BASES.has(base) || COMMON_BASES.has(tail);
}

export function checkPassword(password, username, field = 'password') {
  if (typeof password !== 'string' || password.length < 8) throw bad(`${field} måste vara minst 8 tecken`);
  if (password.length > 200) throw bad(`${field} är för långt`);
  const p = password.toLowerCase();
  if (username && p === username.toLowerCase()) throw bad(`${field} får inte vara samma som användarnamnet`);
  if (COMMON.has(p) || /^(.)\1+$/.test(p) || commonBase(p)) throw bad(`${field} är för vanligt, välj ett annat`);
}

// Användarnamn som kan förväxlas med tjänsten eller personalen (SEC-03, SEC-30).
const RESERVED = /^(admin|administrator|root|system|support|help|hjalp|info|kontakt|contact|security|sakerhet|moderator|moderators|mod|mods|staff|team|gatelog|official|officiell|noreply|no_reply|abuse|privacy|api|www)(_|\d|$)/;
export function isReservedUsername(username) {
  return RESERVED.test(username) || /gatelog/.test(username);
}
