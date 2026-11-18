import { api } from '../../lib/api.js';
import { useAsync } from '../../hooks/useAsync.js';
import { useToast } from '../../components/Toast.jsx';
import { ErrorState, Segmented } from '../../components/ui.jsx';
import { SkeletonRows } from '../../components/Skeleton.jsx';
import { Toggle } from './Toggle.jsx';
import { VisibilityPicker } from '../../components/VisibilityPicker.jsx';

const DELAYS = [
  { value: '0', label: 'Direkt' },
  { value: '1', label: '1 h' },
  { value: '24', label: '24 h' },
  { value: '168', label: '7 dagar' }
];

/** Hook för /me/settings med optimistisk uppdatering per fält. */
export function useSettings() {
  const toast = useToast();
  const s = useAsync(
    () => api.settings(),
    [],
    () => api.peek.settings()
  );
  const update = async (patch) => {
    const prev = s.data;
    s.setData((cur) => ({ ...cur, ...patch, push: { ...cur.push, ...(patch.push || {}) } }));
    try {
      s.setData(await api.updateSettings(patch));
    } catch (e) {
      s.setData(prev);
      toast.error(e);
    }
  };
  return { ...s, update };
}

export const PRIVACY_DEFAULTS = {
  isPrivate: false,
  defaultVisibility: 'public',
  publishDelayHours: 1,
  hideHomeAirport: true,
  notifyHomeVisits: true
};

const VIS_TEXT = { public: 'alla', friends: 'dina följare', private: 'bara dig' };
const DELAY_TEXT = { 0: 'direkt', 1: 'efter 1 h', 24: 'efter 24 h', 168: 'efter 7 dagar' };

/** En mening om vad integritetsvalen betyder, t.ex. vid registrering. */
export function privacySummary(v) {
  const who = v.isPrivate && v.defaultVisibility === 'public' ? 'godkända följare' : VIS_TEXT[v.defaultVisibility];
  const when = v.defaultVisibility === 'private' ? '' : ` ${DELAY_TEXT[v.publishDelayHours] ?? ''}`;
  return `Nya check-ins syns för ${who}${when}. ${v.isPrivate ? 'Profilen är privat.' : 'Profilen är publik.'} Hemmaflygplatsen är ${v.hideHomeAirport ? 'dold' : 'synlig'}.`;
}

/** Integritetsvalen som kontroller. value = settings-objekt, onChange(patch). */
export function PrivacyFields({ value: data, onChange: update, compact = false }) {
  return (
    <div className="stack">
      <div className="setting-list">
        <Toggle
          label="Privat profil"
          hint="Nya följare måste godkännas. Bara godkända följare ser dina check-ins, din karta och dina märken."
          checked={data.isPrivate}
          onChange={(v) => update({ isPrivate: v })}
        />
      </div>
      <div className="field">
        <span className="field__label">Vem ser nya check-ins</span>
        <VisibilityPicker
          label="Vem ser nya check-ins"
          value={data.defaultVisibility}
          onChange={(v) => update({ defaultVisibility: v })}
        />
        <span className="field__hint">Kan ändras för varje check-in.</span>
      </div>
      <div className="field">
        <span className="field__label">Visa check-ins för andra efter</span>
        <Segmented
          name="publishDelay"
          label="Visa check-ins för andra efter"
          options={DELAYS}
          value={String(data.publishDelayHours)}
          onChange={(v) => update({ publishDelayHours: Number(v) })}
        />
        <span className="field__hint">En fördröjning gör att ingen ser var du är just nu.</span>
      </div>
      <div className="setting-list">
        <Toggle
          label="Dölj min hemmaflygplats"
          checked={data.hideHomeAirport}
          onChange={(v) => update({ hideHomeAirport: v })}
        />
        {!compact && (
          <Toggle
            label="Notis när vänner checkar in på min hemmaflygplats"
            checked={data.notifyHomeVisits}
            onChange={(v) => update({ notifyHomeVisits: v })}
          />
        )}
      </div>
    </div>
  );
}

export function PrivacySection({ settings }) {
  const { data, loading, error, reload, update } = settings;
  if (loading && !data) return <SkeletonRows count={3} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  return <PrivacyFields value={data} onChange={update} />;
}
