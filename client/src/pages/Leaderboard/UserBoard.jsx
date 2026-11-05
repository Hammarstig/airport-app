import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { formatDate, sortedCountryOptions } from '../../lib/format.js';
import { SkeletonRows } from '../../components/Skeleton.jsx';
import { EmptyState, ErrorState, Segmented } from '../../components/ui.jsx';
import { IconTrophy, IconUsers } from '../../assets/icons.jsx';
import { Podium } from './Podium.jsx';
import { RankRow } from './RankRow.jsx';

export const METRICS = [
  { value: 'airports', label: 'Flygplatser', unit: 'flygplatser' },
  { value: 'countries', label: 'Länder', unit: 'länder' },
  { value: 'continents', label: 'Kontinenter', unit: 'kontinenter' },
  { value: 'checkins', label: 'Check-ins', unit: 'check-ins' },
  { value: 'reviews', label: 'Recensioner', unit: 'recensioner', allTimeOnly: true },
  { value: 'xp', label: 'XP', unit: 'XP', allTimeOnly: true }
];
const PERIODS = [
  { value: 'week', label: 'Vecka' },
  { value: 'month', label: 'Månad' },
  { value: 'year', label: 'År' },
  { value: 'all', label: 'Alltid' }
];
const SCOPES = [
  { value: 'global', label: 'Världen' },
  { value: 'friends', label: 'Vänner' },
  { value: 'country', label: 'Land' }
];

function readParam(params, key, allowed, fallback) {
  const v = params.get(key);
  return allowed.some((a) => a.value === v) ? v : fallback;
}

/** Fäster egen placering i botten när den egna raden inte syns. */
function usePinMe(ref, active) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    if (!active || !ref.current || !('IntersectionObserver' in window)) return setVisible(!active);
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.6 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [ref, active]);
  return !visible;
}

export function UserBoard() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const metric = readParam(params, 'metric', METRICS, 'airports');
  const m = METRICS.find((x) => x.value === metric);
  const period = m.allTimeOnly ? 'all' : readParam(params, 'period', PERIODS, 'week');
  const scope = readParam(params, 'scope', SCOPES, 'global');
  const scopeOk = user || scope === 'global' ? scope : 'global';
  const effScope = m.allTimeOnly && scopeOk === 'country' ? 'global' : scopeOk;
  const homeCountry = params.get('country') || 'SE';
  const set = (patch) => {
    const n = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? n.set(k, v) : n.delete(k)));
    setParams(n, { replace: true });
  };

  const q = { metric, period, scope: effScope, country: effScope === 'country' ? homeCountry : undefined, limit: 50 };
  const key = JSON.stringify(q);
  const { data, loading, error, reload } = useAsync(
    () => api.userRankings(q),
    [key],
    () => api.peek.userRankings(q)
  );

  const items = data?.items || [];
  const meRef = useRef(null);
  const meInList = !!user && items.some((r) => r.user.username === user.username);
  const pin = usePinMe(meRef, meInList && items.length > 3);
  const meRow = data?.me && user ? { ...data.me, user } : null;
  const showPinned = meRow && (!meInList || pin);

  return (
    <div className="stack">
      <div className="stack">
        <div className="row gap-2" role="group" aria-label="Mått">
          {METRICS.map((x) => (
            <button
              key={x.value}
              type="button"
              className={`chip${x.value === metric ? ' chip--active' : ''}`}
              aria-pressed={x.value === metric}
              onClick={() => set({ metric: x.value })}
            >
              {x.label}
            </button>
          ))}
        </div>
        {!m.allTimeOnly && (
          <Segmented
            name="period"
            label="Period"
            options={PERIODS}
            value={period}
            onChange={(v) => set({ period: v })}
          />
        )}
        <Segmented
          name="scope"
          label="Vilka"
          options={user ? SCOPES.filter((s) => !(m.allTimeOnly && s.value === 'country')) : SCOPES.slice(0, 1)}
          value={effScope}
          onChange={(v) => set({ scope: v })}
        />
        {effScope === 'country' && (
          <div className="field">
            <label className="field__label" htmlFor="lb-country">
              Land
            </label>
            <select
              id="lb-country"
              className="select"
              value={homeCountry}
              onChange={(e) => set({ country: e.target.value })}
            >
              {sortedCountryOptions().map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        )}
        {data?.from && (
          <p className="muted text-sm">
            {formatDate(data.from)} - {formatDate(data.to)}
          </p>
        )}
      </div>

      {loading && !data && <SkeletonRows count={6} />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && items.length === 0 && (
        <EmptyState
          icon={effScope === 'friends' ? IconUsers : IconTrophy}
          title="Ingen på listan för den här perioden ännu"
        >
          {effScope === 'friends' && (
            <Link to="/search?tab=users" className="btn btn--primary btn--sm">
              Hitta resenärer att följa
            </Link>
          )}
        </EmptyState>
      )}
      {items.length > 0 && (
        <>
          <Podium items={items} unit={m.unit} meUsername={user?.username} />
          <ol className="list" aria-label={`Topplista ${m.label.toLowerCase()}`}>
            {items.slice(items.length >= 3 ? 3 : 0).map((r) => {
              const me = user && r.user.username === user.username;
              return <RankRow key={r.user.username} ref={me ? meRef : undefined} row={r} unit={m.unit} me={me} />;
            })}
          </ol>
          {meInList && items.findIndex((r) => r.user.username === user.username) < 3 && <span ref={meRef} />}
        </>
      )}
      {showPinned && (
        <ol className="list" aria-label="Din placering">
          <RankRow row={meRow} unit={m.unit} me pinned />
        </ol>
      )}
    </div>
  );
}
