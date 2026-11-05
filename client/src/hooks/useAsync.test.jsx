import { describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useAsync } from './useAsync.js';

describe('useAsync', () => {
  it('laddar data och rapporterar fel', async () => {
    const { result } = renderHook(() => useAsync(() => Promise.resolve(42), []));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.data).toBe(42));
    const bad = renderHook(() => useAsync(() => Promise.reject(new Error('nej')), []));
    await waitFor(() => expect(bad.result.current.error?.message).toBe('nej'));
  });

  it('visar cachat svar direkt (peek) och ignorerar svar från gamla beroenden', async () => {
    let resolveA;
    const { result, rerender } = renderHook(
      ({ id }) =>
        useAsync(
          () => (id === 'a' ? new Promise((r) => (resolveA = r)) : Promise.resolve('B')),
          [id],
          () => (id === 'b' ? 'B-cache' : undefined)
        ),
      { initialProps: { id: 'a' } }
    );
    await waitFor(() => expect(resolveA).toBeTypeOf('function'));
    rerender({ id: 'b' });
    expect(result.current.data).toBe('B-cache');
    expect(result.current.loading).toBe(false);
    await act(async () => resolveA('A'));
    await waitFor(() => expect(result.current.data).toBe('B'));
  });
});
