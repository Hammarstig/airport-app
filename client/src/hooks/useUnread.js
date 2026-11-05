import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';

const POLL_MS = 60 * 1000;
const listeners = new Set();
let current = 0;

/** Sätt antalet olästa direkt (t.ex. efter att notiser markerats som lästa). */
export function setUnread(n) {
  current = n;
  listeners.forEach((fn) => fn(n));
}

/** Antal olästa notiser. Pollar billigt var 60:e sekund och när fliken blir synlig. */
export function useUnread() {
  const { user } = useAuth();
  const [n, setN] = useState(current);

  useEffect(() => {
    listeners.add(setN);
    return () => listeners.delete(setN);
  }, []);

  useEffect(() => {
    if (!user) return setUnread(0);
    let timer;
    const poll = () => {
      if (document.visibilityState !== 'visible' || !navigator.onLine) return;
      api
        .unreadCount()
        .then((r) => setUnread(r.unread))
        .catch((e) => console.warn('Notiser kunde inte hämtas:', e.message));
    };
    poll();
    timer = setInterval(poll, POLL_MS);
    document.addEventListener('visibilitychange', poll);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', poll);
    };
  }, [user]);

  return n;
}
