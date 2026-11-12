import { describe, expect, it } from 'vitest';
import { applyTheme, getTheme, setTheme } from './theme.js';

describe('tema', () => {
  it('sparar och sätter data-theme och theme-color', () => {
    document.head.innerHTML = '<meta name="theme-color" media="(prefers-color-scheme: light)" content="x">';
    expect(getTheme()).toBe('system');
    setTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.querySelector('meta').content).toBe('#08111E');
    expect(getTheme()).toBe('dark');
    setTheme('system');
    applyTheme();
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });
});
