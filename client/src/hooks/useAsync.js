import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Hämtar data via fn när deps ändras. peek (valfri) returnerar ett cachat svar
 * som visas direkt medan nytt hämtas i bakgrunden (stale-while-revalidate).
 * reload() hämtar om utan att tömma det som visas.
 */
export function useAsync(fn, deps, peek) {
  const [state, setState] = useState(() => {
    const cached = peek ? peek() : undefined;
    return { data: cached ?? null, error: null, loading: cached === undefined };
  });
  const fnRef = useRef(fn);
  const peekRef = useRef(peek);
  fnRef.current = fn;
  peekRef.current = peek;
  const gen = useRef(0);

  const run = useCallback((keep) => {
    const my = ++gen.current;
    const cached = keep ? undefined : peekRef.current ? peekRef.current() : undefined;
    const hasData = keep || cached !== undefined;
    if (!keep) setState({ data: cached ?? null, error: null, loading: cached === undefined });
    Promise.resolve()
      .then(() => fnRef.current())
      .then(
        (data) => my === gen.current && setState({ data, error: null, loading: false }),
        (error) => {
          if (my !== gen.current) return;
          setState((s) =>
            hasData && s.data != null ? { ...s, loading: false } : { data: null, error, loading: false }
          );
        }
      );
  }, []);

  useEffect(() => {
    run(false);
    const g = gen;
    return () => {
      g.current++;
    };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps -- anroparen anger beroenden (som useEffect)

  const reload = useCallback(() => run(true), [run]);
  const setData = useCallback(
    (updater) => setState((s) => ({ ...s, data: typeof updater === 'function' ? updater(s.data) : updater })),
    []
  );

  return { ...state, reload, setData };
}
