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

export function checkPassword(password, username, field = 'password') {
  if (typeof password !== 'string' || password.length < 8) throw bad(`${field} måste vara minst 8 tecken`);
  if (password.length > 200) throw bad(`${field} är för långt`);
  const p = password.toLowerCase();
  if (username && p === username.toLowerCase()) throw bad(`${field} får inte vara samma som användarnamnet`);
  if (COMMON.has(p) || /^(.)\1+$/.test(p)) throw bad(`${field} är för vanligt, välj ett annat`);
}
