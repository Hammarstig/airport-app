import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { useAuth } from './auth.jsx';
import { mockFetch, renderApp } from '../test/utils.jsx';

function Who() {
  const { user, ready } = useAuth();
  return <p>{ready ? (user ? `inloggad ${user.username}` : 'utloggad') : 'laddar'}</p>;
}

const seed = () => {
  localStorage.setItem('gatelog.token', 'aaa.bbb.ccc');
  localStorage.setItem('gatelog.user', JSON.stringify({ username: 'anna' }));
};

describe('AuthProvider', () => {
  it('behåller inloggningen vid nätverksfel och 5xx', async () => {
    seed();
    mockFetch({ '/api/me': () => new Response('{"error":"Bad gateway"}', { status: 502 }) });
    renderApp(<Who />);
    expect(screen.getByText('inloggad anna')).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByText('inloggad anna')).toBeInTheDocument();
    expect(localStorage.getItem('gatelog.token')).toBe('aaa.bbb.ccc');
  });

  it('loggar ut vid 401', async () => {
    seed();
    mockFetch({ '/api/me': () => new Response('{"error":"Ej inloggad"}', { status: 401 }) });
    renderApp(<Who />);
    await waitFor(() => expect(screen.getByText('utloggad')).toBeInTheDocument());
    expect(localStorage.getItem('gatelog.token')).toBeNull();
  });
});
