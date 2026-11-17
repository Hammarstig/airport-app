import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, expectSession, getToken, onRefreshed, onUnauthorized, setToken } from './api.js';
import { setQueueOwner } from './offlineQueue.js';
import { stopPush, wipeLocalData } from './localData.js';
import { load, save } from './storage.js';

const USER_KEY = 'gatelog.user';
const AuthContext = createContext(null);

/**
 * Inloggningsstatus. Senast kända användare sparas lokalt (inga hemligheter) så att appen startar
 * inloggad direkt och även offline; access-token hämtas via refresh-cookien vid första API-anropet.
 * Sessionen avslutas bara när servern säger det (401 som inte går att förnya).
 */
export function initialUser() {
  const cached = load(USER_KEY);
  expectSession(!!cached || !!getToken());
  return cached;
}

export function AuthProvider({ children }) {
  const [user, setUserState] = useState(initialUser);
  // Vänta på /me bara om det finns en token men ingen sparad användare (migrering från äldre version).
  const [ready, setReady] = useState(() => !(getToken() && !load(USER_KEY)));

  const setUser = useCallback((u) => {
    setUserState((prev) => {
      const next = typeof u === 'function' ? u(prev) : u;
      save(USER_KEY, next);
      return next;
    });
  }, []);

  // Lokal utloggning. Används när sessionen återkallats på servern eller kontot raderats:
  // push avregistreras och personlig data rensas, men egna köade check-ins behålls (de skickas
  // bara om samma konto loggar in igen) utom när kontot är raderat.
  const clear = useCallback(
    ({ keepQueue = true } = {}) => {
      stopPush();
      setToken(null);
      setUser(null);
      wipeLocalData({ keepQueue });
    },
    [setUser]
  );

  /**
   * Loggar ut: avregistrerar push, återkallar sessionen på servern (om nätet finns) och rensar
   * allt personligt på enheten, även offlinekön (delad enhet, SEC-11 och SEC-13).
   */
  const logout = useCallback(async () => {
    await stopPush();
    try {
      await api.logout();
    } catch (e) {
      if (e.status === undefined) console.warn('Utloggning på servern misslyckades (offline):', e.message);
    }
    setToken(null);
    setUser(null);
    await wipeLocalData();
  }, [setUser]);

  useEffect(() => onUnauthorized(() => clear()), [clear]);
  // Offlinekön visar och skickar bara den inloggade användarens poster.
  useEffect(() => setQueueOwner(user?.username || null), [user?.username]);
  useEffect(() => onRefreshed((u) => u && setUser(u)), [setUser]);

  useEffect(() => {
    if (!user && !getToken()) return;
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- verifiera sessionen en gång vid start

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
    () => ({ user, ready, login, register, logout, clear, setUser }),
    [user, ready, login, register, logout, clear, setUser]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth måste användas inom AuthProvider');
  return ctx;
}
