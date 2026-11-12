import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuickPick } from './QuickPick.jsx';
import { mockFetch, renderApp, loginAs } from '../../test/utils.jsx';

describe('QuickPick', () => {
  it('visar senaste och väljer med ett tryck', async () => {
    loginAs('anna');
    mockFetch({
      '/api/me': { username: 'anna' },
      '/api/me/recent-airports': [
        { airport: { iata: 'GOT', name: 'Landvetter', city: 'Göteborg' }, visits: 3, isHome: true },
        { airport: { iata: 'CPH', name: 'Kastrup', city: 'Köpenhamn' }, visits: 1, isHome: false }
      ]
    });
    const onPick = vi.fn();
    renderApp(<QuickPick onPick={onPick} />);
    const btn = await screen.findByRole('button', { name: /Kastrup/ });
    expect(screen.getByText('Hemmaflygplats')).toBeInTheDocument();
    await userEvent.click(btn);
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ iata: 'CPH' }));
  });

  it('använder lokalt sparade senaste när nätet saknas (BUG-10)', async () => {
    loginAs('anna');
    localStorage.setItem(
      'gatelog.recent',
      JSON.stringify([{ airport: { iata: 'ARN', name: 'Arlanda', city: 'Stockholm' }, visits: 2, isHome: false }])
    );
    global.fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    renderApp(<QuickPick onPick={() => {}} />);
    expect(await screen.findByRole('button', { name: /Arlanda/ })).toBeInTheDocument();
  });
});
