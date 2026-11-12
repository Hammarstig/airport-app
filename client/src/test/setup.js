import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { cacheClear } from '../lib/cache.js';
import { setToken } from '../lib/api.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  setToken(null);
  cacheClear();
});
