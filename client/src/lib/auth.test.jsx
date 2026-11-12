import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { useAuth } from './auth.jsx';
import { getToken } from './api.js';
import { mockFetch, renderApp, loginAs } from '../test/utils.jsx';

function Who() {
  const { user, ready } = useAuth();
  return <p>{ready ? (user ? `inloggad ${user.username}` : 'utloggad') : 'laddar'}</p>;
}

const seed = () => {
  loginAs('anna');
};

describe('AuthProvider', () => {
  it('behåller inloggningen vid nätverksfel och 5xx', async () => {
    seed();
    mockFetch({ '/api/me': () => new Response('{"error":"Bad gateway"}', { status: 502 }) });
    renderApp(<Who />);
    expect(screen.getByText('inloggad anna')).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByText('inloggad anna')).toBeInTheDocument();
    expect(getToken()).toBe('aaa.bbb.ccc');
  });

  it('loggar ut vid 401', async () => {
    seed();
    mockFetch({ '/api/me': () => new Response('{"error":"Ej inloggad"}', { status: 401 }) });
    renderApp(<Who />);
    await waitFor(() => expect(screen.getByText('utloggad')).toBeInTheDocument());
    expect(getToken()).toBeNull();
    expect(localStorage.getItem('gatelog.user')).toBeNull();
  });

  it('hämtar access-token via refresh-cookien vid sidladdning (token bara i minnet)', async () => {
    localStorage.setItem('gatelog.user', JSON.stringify({ username: 'anna' }));
    const calls = mockFetch({
      '/api/auth/refresh': { token: 'new.tok.en', user: { username: 'anna' }, expiresIn: 900 },
      '/api/me': (url, init) =>
        init.headers.Authorization === 'Bearer new.tok.en' ? { username: 'anna' } : new Response('{}', { status: 401 })
    });
    renderApp(<Who />);
    expect(screen.getByText('inloggad anna')).toBeInTheDocument();
    await waitFor(() => expect(calls.map((c) => c.url)).toEqual(['/api/auth/refresh', '/api/me']));
    expect(getToken()).toBe('new.tok.en');
    expect(localStorage.getItem('gatelog.token')).toBeNull();
  });
});
