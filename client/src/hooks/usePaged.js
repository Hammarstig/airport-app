import { useCallback, useEffect, useRef, useState } from 'react';

/** Sidindelad lista med "Ladda fler". peekFirst (valfri) ger cachad första sida. */
export function usePaged(fetchPage, deps, pageSize = 20, peekFirst) {
  const [items, setItems] = useState(() => (peekFirst && peekFirst(pageSize)) || []);
  const [loading, setLoading] = useState(items.length === 0);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(items.length === pageSize);
  const fetchRef = useRef(fetchPage);
  const peekRef = useRef(peekFirst);
  fetchRef.current = fetchPage;
  peekRef.current = peekFirst;
  const gen = useRef(0);

  const load = useCallback(
    async (offset, replace, quiet) => {
      const my = ++gen.current;
      if (!quiet) setLoading(true);
      setError(null);
      try {
        const page = (await fetchRef.current(pageSize, offset)) || [];
        if (my !== gen.current) return;
        setItems((prev) => (replace ? page : [...prev, ...page]));
        setHasMore(page.length === pageSize);
      } catch (e) {
        if (my === gen.current) setError(e);
      } finally {
        if (my === gen.current) setLoading(false);
      }
    },
    [pageSize]
  );

  useEffect(() => {
    const cached = peekRef.current ? peekRef.current(pageSize) : undefined;
    setItems(cached || []);
    setHasMore(!!cached && cached.length === pageSize);
    load(0, true, !!cached);
    return () => {
      gen.current++;
    };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    items,
    setItems,
    loading,
    error,
    hasMore,
    loadMore: () => load(items.length, false),
    reload: () => load(0, true, true)
  };
}
