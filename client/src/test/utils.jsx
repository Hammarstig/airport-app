import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../components/Toast.jsx';
import { AuthProvider } from '../lib/auth.jsx';

/** Renderar med router, toast och auth som i appen. */
export function renderApp(ui, { route = '/' } = {}) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <ToastProvider>
        <AuthProvider>{ui}</AuthProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}

/** Ersätter fetch med en funktion som svarar per sökväg. routes: { '/api/x': data | (url, init) => data } */
export function mockFetch(routes) {
  const calls = [];
  global.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const path = String(url).split('?')[0];
    const hit = Object.keys(routes).find((k) => path === k);
    if (!hit) return new Response(JSON.stringify({ error: 'saknas' }), { status: 404 });
    const v = typeof routes[hit] === 'function' ? await routes[hit](String(url), init) : routes[hit];
    if (v instanceof Response) return v;
    return new Response(JSON.stringify(v), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  return calls;
}
