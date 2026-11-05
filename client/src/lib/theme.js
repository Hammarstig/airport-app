import { load, save } from './storage.js';

const KEY = 'gatelog.theme';
const COLORS = { light: '#F3F7FB', dark: '#08111E' };
export const THEMES = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Ljust' },
  { value: 'dark', label: 'Mörkt' }
];

export function getTheme() {
  const t = load(KEY, 'system');
  return THEMES.some((x) => x.value === t) ? t : 'system';
}

/** Sätter data-theme på <html> och statusfältets färg (theme-color) efter valt tema. */
export function applyTheme(theme = getTheme()) {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  const metas = document.querySelectorAll('meta[name="theme-color"]');
  metas.forEach((m) => {
    if (theme === 'system') m.setAttribute('content', m.media.includes('dark') ? COLORS.dark : COLORS.light);
    else m.setAttribute('content', COLORS[theme]);
  });
}

export function setTheme(theme) {
  save(KEY, theme === 'system' ? null : theme);
  applyTheme(theme);
}
