import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, onUnauthorized, setToken } from './api.js';
import { load, save } from './storage.js';

const USER_KEY = 'gatelog.user';
const AuthContext = createContext(null);

/**
 * Inloggningsstatus. Senast kända användare sparas lokalt så att appen startar
 * inloggad även offline. Token rensas bara när servern svarar 401.
 */
export function AuthProvider({ children }) {
  const [user, setUserState] = useState(() => (getToken() ? load(USER_KEY) : null));
  const [ready, setReady] = useState(() => !getToken() || !!load(USER_KEY));

  const setUser = useCallback((u) => {
    setUserState((prev) => {
      const next = typeof u === 'function' ? u(prev) : u;
      save(USER_KEY, next);
      return next;
    });
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, [setUser]);

  useEffect(() => onUnauthorized(logout), [logout]);

  useEffect(() => {
    if (!getToken()) return;
    let cancelled = false;
    api
      .me()
      .then((u) => !cancelled && setUser(u))
      .catch((e) => {
        // 401 hanteras av onUnauthorized. Nätverksfel och 5xx: behåll sessionen.
        if (e.status !== 401) console.warn('Kunde inte verifiera inloggningen:', e.message);
      })
      .finally(() => !cancelled && setReady(true));
    return () => {
      cancelled = true;
    };
  }, [setUser]);

  const login = useCallback(
    async (username, password) => {
      const res = await api.login({ username, password });
      setToken(res.token);
      setUser(res.user);
      return res.user;
    },
    [setUser]
  );

  const register = useCallback(
    async (body) => {
      const res = await api.register(body);
      setToken(res.token);
      setUser(res.user);
      return res.user;
    },
    [setUser]
  );

  const value = useMemo(
    () => ({ user, ready, login, register, logout, setUser }),
    [user, ready, login, register, logout, setUser]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth måste användas inom AuthProvider');
  return ctx;
}
