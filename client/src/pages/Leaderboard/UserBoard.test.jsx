import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { UserBoard } from './UserBoard.jsx';
import { mockFetch, renderApp } from '../../test/utils.jsx';

const u = (n) => ({ username: n, displayName: n, level: 2 });

describe('UserBoard', () => {
  it('visar alltid en egen rad med uppmaning när jag saknar värde', async () => {
    localStorage.setItem('gatelog.token', 'aaa.bbb.ccc');
    localStorage.setItem('gatelog.user', JSON.stringify({ username: 'me' }));
    mockFetch({
      '/api/me': { username: 'me' },
      '/api/rankings/users': {
        metric: 'airports',
        period: 'week',
        from: '2026-11-09',
        to: '2026-11-15',
        items: [{ rank: 1, user: u('anna'), value: 3, change: 1 }],
        me: null,
        around: []
      }
    });
    renderApp(<UserBoard />);
    const mine = await screen.findByRole('list', { name: 'Din placering' });
    expect(mine).toHaveTextContent('0 flygplatser denna vecka');
    expect(screen.getByRole('link', { name: 'Checka in' })).toBeInTheDocument();
  });

  it('fäster egen placering när jag är utanför listan', async () => {
    localStorage.setItem('gatelog.token', 'aaa.bbb.ccc');
    localStorage.setItem('gatelog.user', JSON.stringify({ username: 'me' }));
    mockFetch({
      '/api/me': { username: 'me' },
      '/api/rankings/users': {
        metric: 'airports',
        period: 'week',
        from: null,
        to: null,
        items: [1, 2, 3, 4].map((i) => ({ rank: i, user: u(`u${i}`), value: 10 - i, change: null })),
        me: { rank: 57, value: 1, change: -2 },
        around: []
      }
    });
    renderApp(<UserBoard />);
    const mine = await screen.findByRole('list', { name: 'Din placering' });
    expect(mine).toHaveTextContent('57');
    expect(mine.querySelector('[aria-current="true"]')).toBeTruthy();
  });
});
