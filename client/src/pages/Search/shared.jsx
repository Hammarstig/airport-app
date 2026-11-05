import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SkeletonRows } from '../../components/Skeleton.jsx';
import { ErrorState } from '../../components/ui.jsx';

export const PAGE = 20;

/** Läser/skriver filter i URL:en så att sökningar kan delas. */
export function useQueryState() {
  const [params, setParams] = useSearchParams();
  const get = (k, d = '') => params.get(k) ?? d;
  const set = (patch) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === '' || v === null || v === undefined) next.delete(k);
      else next.set(k, String(v));
    }
    setParams(next, { replace: true });
  };
  return { params, get, set };
}

/** Generisk sidindelad hämtning styrd av en nyckel (sträng). */
export function useSearchResults(key, fetcher, enabled = true) {
  const [state, setState] = useState({ items: [], loading: false, error: null, hasMore: false });
  useEffect(() => {
    if (!enabled) {
      setState({ items: [], loading: false, error: null, hasMore: false });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null, items: [] }));
    fetcher(0)
      .then(
        (r) =>
          !cancelled && setState({ items: r || [], loading: false, error: null, hasMore: (r || []).length === PAGE })
      )
      .catch((e) => !cancelled && setState({ items: [], loading: false, error: e, hasMore: false }));
    return () => {
      cancelled = true;
    };
  }, [key, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = async () => {
    setState((s) => ({ ...s, loading: true }));
    try {
      const r = await fetcher(state.items.length);
      setState((s) => ({ items: [...s.items, ...r], loading: false, error: null, hasMore: r.length === PAGE }));
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e }));
    }
  };
  return { ...state, loadMore };
}

export function Results({ res, empty, children }) {
  return (
    <div className="stack">
      {res.error && <ErrorState error={res.error} />}
      {!res.loading && !res.error && res.items.length === 0 && empty}
      {res.items.length > 0 && children}
      {res.loading && <SkeletonRows count={res.items.length ? 2 : 5} />}
      {!res.loading && res.hasMore && (
        <button type="button" className="btn btn--ghost btn--block" onClick={res.loadMore}>
          Ladda fler
        </button>
      )}
    </div>
  );
}

export function FilterSelect({ id, label, value, onChange, options, all = 'Alla' }) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <select id={id} className="select" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{all}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
