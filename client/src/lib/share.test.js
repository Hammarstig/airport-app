import { afterEach, describe, expect, it, vi } from 'vitest';
import { share } from './share.js';

describe('share', () => {
  afterEach(() => {
    delete navigator.share;
  });
  it('använder Web Share med absolut URL', async () => {
    navigator.share = vi.fn(async () => {});
    expect(await share({ title: 't', text: 'x', url: '/c/1' })).toBe('shared');
    expect(navigator.share).toHaveBeenCalledWith(expect.objectContaining({ url: `${location.origin}/c/1` }));
  });
  it('avbruten delning är inget fel', async () => {
    navigator.share = vi.fn(async () => {
      throw Object.assign(new Error('x'), { name: 'AbortError' });
    });
    expect(await share({ url: '/' })).toBe('cancelled');
  });
  it('kopierar länken som reserv', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    expect(await share({ text: 'Hej', url: '/u/a' })).toBe('copied');
    expect(writeText).toHaveBeenCalledWith(`Hej ${location.origin}/u/a`);
  });
});
