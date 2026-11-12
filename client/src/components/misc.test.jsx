import { describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouteErrorBoundary } from './RouteErrorBoundary.jsx';
import { PushPrompt } from './PushPrompt.jsx';
import { NotificationBell } from './NotificationBell.jsx';
import { CheckinCard } from './CheckinCard.jsx';
import { useDebounced } from '../hooks/useDebounced.js';
import { usePaged } from '../hooks/usePaged.js';
import { setUnread } from '../hooks/useUnread.js';
import { mockFetch, renderApp } from '../test/utils.jsx';

function Boom() {
  throw new Error('Failed to fetch dynamically imported module: /assets/X.js');
}

const checkin = {
  id: 7,
  user: { username: 'anna', displayName: 'Anna' },
  airport: { iata: 'GOT', name: 'Landvetter', city: 'Göteborg', country: 'SE' },
  visitedOn: '2026-11-01',
  createdAt: '2026-11-01T10:00:00Z',
  kind: 'departure',
  rating: 4,
  ratings: { security: 4, food: 3, wifi: 5, cleanliness: 4, transfer: null, lounges: null },
  comment: 'Bra',
  likes: 1,
  likedByMe: false,
  commentCount: 2,
  photos: [],
  airline: { iata: 'SK', name: 'SAS' },
  travelClass: 'business',
  lounge: null,
  flightNumber: 'SK1'
};

describe('RouteErrorBoundary', () => {
  it('visar "Kunde inte ladda sidan" i stället för vit sida', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <RouteErrorBoundary resetKey="/x">
        <Boom />
      </RouteErrorBoundary>
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Kunde inte ladda sidan');
    expect(screen.getByRole('button', { name: 'Försök igen' })).toBeInTheDocument();
  });
});

describe('PushPrompt', () => {
  it('visas inte när push saknas i webbläsaren', () => {
    const { container } = renderApp(<PushPrompt />);
    expect(container.querySelector('#push-title')).toBeNull();
  });
});

describe('NotificationBell', () => {
  it('räknaren finns i knappens etikett', async () => {
    mockFetch({});
    renderApp(<NotificationBell />);
    act(() => setUnread(3));
    expect(screen.getByRole('link', { name: 'Notiser, 3 olästa' })).toBeInTheDocument();
    act(() => setUnread(0));
    expect(screen.getByRole('link', { name: 'Notiser' })).toBeInTheDocument();
  });
});

describe('CheckinCard', () => {
  it('visar tre delbetyg och +N, resedetaljer på en rad och kommentarsräknare', () => {
    mockFetch({});
    renderApp(<CheckinCard checkin={checkin} />);
    expect(screen.getByText('+1')).toBeInTheDocument();
    expect(screen.getByText('SK1 · SAS · Business')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Kommentarer, 2' })).toHaveAttribute('href', '/c/7');
  });

  it('gilla uppdateras direkt och rullas tillbaka vid fel', async () => {
    localStorage.setItem('gatelog.token', 'aaa.bbb.ccc');
    localStorage.setItem('gatelog.user', JSON.stringify({ username: 'me' }));
    let resolve;
    global.fetch = vi.fn((url) =>
      url.includes('/like') ? new Promise((r) => (resolve = r)) : Promise.resolve(new Response('{}'))
    );
    renderApp(<CheckinCard checkin={checkin} />);
    const like = screen.getByRole('button', { name: /^Gilla/ });
    await userEvent.click(like);
    expect(screen.getByRole('button', { name: /Sluta gilla, 2 gillar/ })).toHaveAttribute('aria-pressed', 'true');
    await act(async () => resolve(new Response('{"error":"nej"}', { status: 500 })));
    await waitFor(() => expect(screen.getByRole('button', { name: /^Gilla, 1 gillar/ })).toBeInTheDocument());
  });
});

describe('hooks', () => {
  it('useDebounced väntar', async () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ v }) => useDebounced(v, 150), { initialProps: { v: 'a' } });
    rerender({ v: 'ab' });
    expect(result.current).toBe('a');
    act(() => vi.advanceTimersByTime(160));
    expect(result.current).toBe('ab');
    vi.useRealTimers();
  });

  it('usePaged laddar sidor och vet när det finns fler', async () => {
    const pages = [[1, 2], [3]];
    const { result } = renderHook(() => usePaged((limit, offset) => Promise.resolve(pages[offset / 2] || []), [], 2));
    await waitFor(() => expect(result.current.items).toEqual([1, 2]));
    expect(result.current.hasMore).toBe(true);
    await act(async () => {
      await result.current.loadMore();
    });
    await waitFor(() => expect(result.current.items).toEqual([1, 2, 3]));
    expect(result.current.hasMore).toBe(false);
  });
});
