import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { cacheClear } from '../lib/cache.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  cacheClear();
});
