import { describe, expect, it, vi } from 'vitest';
import { act, screen } from '@testing-library/react';
import { OfflineBanner } from './OfflineBanner.jsx';
import { renderApp } from '../test/utils.jsx';

describe('OfflineBanner', () => {
  it('visar offline och döljs när nätet är tillbaka', async () => {
    const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    global.fetch = vi.fn(async () => {
      throw new TypeError('offline');
    });
    renderApp(<OfflineBanner />);
    expect(await screen.findByText('Du är offline')).toBeInTheDocument();
    spy.mockReturnValue(true);
    await act(async () => window.dispatchEvent(new Event('online')));
    expect(screen.queryByText('Du är offline')).toBeNull();
  });
});
