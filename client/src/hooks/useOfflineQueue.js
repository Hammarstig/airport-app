import { useEffect, useState } from 'react';
import { subscribe } from '../lib/offlineQueue.js';

export function useOfflineQueue() {
  const [s, setS] = useState({ items: [], sending: false });
  useEffect(() => subscribe(setS), []);
  return s;
}
