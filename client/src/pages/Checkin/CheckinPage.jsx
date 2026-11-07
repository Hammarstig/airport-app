import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useToast } from '../../components/Toast.jsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { KINDS, SUB_RATINGS, formatDate, placeLine, todayIso } from '../../lib/format.js';
import { AirportAutocomplete } from '../../components/AirportAutocomplete.jsx';
import { StarsInput } from '../../components/StarsInput.jsx';
import { PhotoPicker } from '../../components/PhotoPicker.jsx';
import { PageSkeleton } from '../../components/Skeleton.jsx';
import { ErrorState, Segmented } from '../../components/ui.jsx';
import { TravelSection } from './TravelSection.jsx';
import { QuickPick } from './QuickPick.jsx';
import { Disclosure } from './Disclosure.jsx';
import { MAX_COMMENT, useCheckinForm, validate } from './useCheckinForm.js';
import { saveEdit, submitCheckin } from './submitCheckin.js';

const KIND_HINT = {
  departure: 'Du flög härifrån.',
  arrival: 'Du landade här och lämnade flygplatsen.',
  transfer: 'Du bytte flyg här utan att lämna flygplatsen.',
  layover: 'Längre uppehåll, eller planet stannade och flög vidare.'
};

function SelectedAirport({ airport, onChange }) {
  return (
    <div className="selected-airport">
      <span className="iata-tag iata-tag--lg">{airport.iata}</span>
      <span className="selected-airport__text">
        <strong>{airport.name}</strong>
        <span className="muted">{placeLine(airport)}</span>
      </span>
      {onChange && (
        <button type="button" className="btn btn--ghost btn--sm" onClick={onChange}>
          Byt
        </button>
      )}
    </div>
  );
}

export default function CheckinPage() {
  const { id: editId } = useParams();
  const [params] = useSearchParams();
  const preset = { iata: (params.get('iata') || '').toUpperCase(), date: params.get('date'), kind: params.get('kind') };
  const editing = !!editId;
  useDocumentTitle(editing ? 'Redigera check-in' : 'Checka in');
  const navigate = useNavigate();
  const toast = useToast();
  const form = useCheckinForm(editId, preset);
  const { f, set, setTravel } = form;
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(null);

  if (form.loading) return <PageSkeleton />;
  if (editing && form.loadError)
    return (
      <div className="page">
        <ErrorState error={form.loadError} />
      </div>
    );

  const submit = async (e) => {
    e.preventDefault();
    const errs = validate(f);
    setErrors(errs);
    if (Object.keys(errs).length) {
      // Öppna sektionen med felet och fokusera fältet.
      requestAnimationFrame(() => {
        const el = document.querySelector('[aria-invalid="true"]');
        el?.closest('details')?.setAttribute('open', '');
        el?.focus();
      });
      return;
    }
    setSaving('Sparar...');
    try {
      if (editing) {
        const { failedPhotos } = await saveEdit(editId, { ...f, photos: form.photos }, form.removedPhotos, setSaving);
        if (failedPhotos) toast.error(`${failedPhotos} foto(n) kunde inte sparas.`);
        toast.show('Check-in uppdaterad.');
        navigate(-1);
        return;
      }
      const res = await submitCheckin({ ...f, photos: form.photos }, setSaving);
      if (res.failedPhotos) toast.error(`${res.failedPhotos} foto(n) kunde inte laddas upp.`);
      navigate('/checkin/done', {
        replace: true,
        state: res.queued ? { queued: true, airport: f.airport, visitedOn: f.visitedOn } : { result: res.checkin }
      });
    } catch (err) {
      toast.error(err);
      setSaving(null);
    }
  };

  const subCount = SUB_RATINGS.filter((s) => f.ratings[s.key] != null).length;
  const photoCount = f.existingPhotos.length + form.photos.length;
  const t = f.travel;
  const travelSummary = [t.flightNumber, t.airline?.iata, t.travelClass && 'klass', t.loungeChoice && 'lounge']
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="page">
      <header className="page__header">
        <h1 className="page__title">{editing ? 'Redigera check-in' : 'Checka in'}</h1>
      </header>

      <form onSubmit={submit} noValidate className="stack stack--lg">
        {!f.airport && form.presetPending ? (
          // Förvald flygplats (?iata=) laddas: platshållare i samma höjd så att formuläret inte hoppar.
          <div className="selected-airport skeleton" aria-busy="true">
            <span className="iata-tag iata-tag--lg">{preset.iata}</span>
            <span className="visually-hidden">Laddar flygplats</span>
          </div>
        ) : !f.airport ? (
          <div className="stack">
            <QuickPick onPick={(a) => set({ airport: a })} />
            <AirportAutocomplete
              label="Sök flygplats"
              placeholder="Stad, flygplats eller IATA"
              value={null}
              onSelect={(a) => a && set({ airport: a })}
              error={errors.airport}
            />
          </div>
        ) : (
          <SelectedAirport airport={f.airport} onChange={editing ? null : () => set({ airport: null })} />
        )}

        {
          <>
            <div className="field">
              <span className="field__label">Typ av besök</span>
              <Segmented
                options={KINDS}
                value={f.kind}
                onChange={(kind) => set({ kind })}
                label="Typ av besök"
                name="kind"
              />
              <span className="field__hint">{KIND_HINT[f.kind]}</span>
            </div>

            <div className="field">
              <span className="field__label">Betyg</span>
              <StarsInput value={f.rating} onChange={(rating) => set({ rating })} label="Totalbetyg" />
            </div>

            <div className="field">
              <label className="field__label" htmlFor="comment">
                Kommentar
              </label>
              <textarea
                id="comment"
                className="textarea"
                rows={3}
                maxLength={MAX_COMMENT}
                placeholder="Säkerhetskontroll, mat, lounge, tips..."
                value={f.comment}
                onChange={(e) => set({ comment: e.target.value })}
                aria-describedby="comment-count"
              />
              {f.comment.length > MAX_COMMENT - 200 && (
                <div id="comment-count" className="field__hint" aria-live="polite">
                  {f.comment.length} / {MAX_COMMENT} tecken
                </div>
              )}
            </div>

            <div className="disclosure-group">
              <Disclosure
                title="Datum"
                summary={f.visitedOn === todayIso() ? 'Idag' : formatDate(f.visitedOn)}
                defaultOpen={!!errors.visitedOn}
              >
                <div className="field">
                  <label className="visually-hidden" htmlFor="visitedOn">
                    Datum
                  </label>
                  <input
                    id="visitedOn"
                    className="input"
                    type="date"
                    max={todayIso()}
                    value={f.visitedOn}
                    onChange={(e) => set({ visitedOn: e.target.value })}
                    aria-invalid={errors.visitedOn ? true : undefined}
                    aria-describedby={errors.visitedOn ? 'visitedOn-err' : undefined}
                  />
                  {errors.visitedOn && (
                    <div className="field__error" id="visitedOn-err">
                      {errors.visitedOn}
                    </div>
                  )}
                </div>
              </Disclosure>

              <Disclosure title="Delbetyg" summary={subCount ? `${subCount} av ${SUB_RATINGS.length}` : 'Valfritt'}>
                <div className="stack">
                  {SUB_RATINGS.map((s) => (
                    <div key={s.key} className="row row--between row--nowrap">
                      <span>{s.label}</span>
                      <StarsInput
                        half={false}
                        size="1.6rem"
                        value={f.ratings[s.key] ?? null}
                        onChange={(v) => set((cur) => ({ ratings: { ...cur.ratings, [s.key]: v } }))}
                        label={s.label}
                      />
                    </div>
                  ))}
                </div>
              </Disclosure>

              <Disclosure title="Foton" summary={photoCount ? `${photoCount} st` : 'Valfritt'}>
                <PhotoPicker
                  hideLabel
                  value={form.photos}
                  onChange={form.setPhotos}
                  onError={toast.error}
                  existing={f.existingPhotos}
                  onRemoveExisting={form.removeExisting}
                />
              </Disclosure>

              <Disclosure
                title="Resedetaljer"
                summary={travelSummary || 'Flygbolag, flight, klass, lounge'}
                defaultOpen={!!(errors.flightNumber || errors.newLounge)}
              >
                <TravelSection
                  v={t}
                  set={setTravel}
                  lounges={form.lounges}
                  airportChosen
                  errors={errors}
                  allowNewLounge={!editing}
                />
              </Disclosure>
            </div>
          </>
        }

        <div className="sticky-actions">
          <button type="submit" className="btn btn--primary btn--block" disabled={!!saving || !f.airport}>
            {saving || (editing ? 'Spara ändringar' : f.airport ? `Checka in på ${f.airport.iata}` : 'Välj flygplats')}
          </button>
        </div>
      </form>
    </div>
  );
}
