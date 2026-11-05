import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useToast } from '../../components/Toast.jsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { KINDS, SUB_RATINGS, todayIso } from '../../lib/format.js';
import { AirportAutocomplete } from '../../components/AirportAutocomplete.jsx';
import { StarsInput } from '../../components/StarsInput.jsx';
import { PhotoPicker } from '../../components/PhotoPicker.jsx';
import { Segmented } from '../../components/ui.jsx';
import { TravelSection } from './TravelSection.jsx';
import { submitCheckin } from './submitCheckin.js';

const MAX_COMMENT = 1000;
const EMPTY_TRAVEL = {
  airline: null,
  flightNumber: '',
  travelClass: '',
  loungeChoice: '',
  newLounge: { name: '', terminal: '' },
  loungeRating: null
};

export default function CheckinPage() {
  useDocumentTitle('Checka in');
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [airport, setAirport] = useState(null);
  const [lounges, setLounges] = useState([]);
  const [visitedOn, setVisitedOn] = useState(todayIso());
  const [kind, setKind] = useState('departure');
  const [rating, setRating] = useState(null);
  const [ratings, setRatings] = useState({});
  const [showSubs, setShowSubs] = useState(false);
  const [comment, setComment] = useState('');
  const [travel, setTravel] = useState(EMPTY_TRAVEL);
  const [photos, setPhotos] = useState([]);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(null);

  const preIata = (params.get('iata') || '').toUpperCase();
  useEffect(() => {
    if (!/^[A-Z]{3}$/.test(preIata)) return;
    api
      .airport(preIata)
      .then(setAirport)
      .catch(() => toast.error(`Hittade ingen flygplats med koden ${preIata}.`));
  }, [preIata]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lounger för vald flygplats (flygplatsobjektet från /airports/:iata har dem redan).
  useEffect(() => {
    setTravel((t) => ({ ...t, loungeChoice: '', loungeRating: null }));
    if (!airport) return setLounges([]);
    if (airport.lounges) return setLounges(airport.lounges);
    let live = true;
    api
      .airport(airport.iata)
      .then((a) => live && setLounges(a.lounges || []))
      .catch(() => live && setLounges([]));
    return () => {
      live = false;
    };
  }, [airport?.iata]); // eslint-disable-line react-hooks/exhaustive-deps

  const today = todayIso();

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!airport) errs.airport = 'Välj en flygplats i listan.';
    if (!visitedOn) errs.visitedOn = 'Ange datum.';
    else if (visitedOn > today) errs.visitedOn = 'Datumet kan inte vara i framtiden.';
    if (comment.length > MAX_COMMENT) errs.comment = `Max ${MAX_COMMENT} tecken.`;
    if (travel.flightNumber && !/^[A-Z0-9]{2,8}$/.test(travel.flightNumber))
      errs.flightNumber = 'Ange t.ex. SK1421 (2-8 tecken A-Z, 0-9).';
    if (travel.loungeChoice === 'new' && !travel.newLounge.name.trim()) errs.newLounge = 'Ange loungens namn.';
    setErrors(errs);
    if (Object.keys(errs).length) {
      const first = document.querySelector('[aria-invalid="true"]');
      first && first.focus();
      return;
    }

    setSaving('Sparar...');
    try {
      const { checkin, failedPhotos } = await submitCheckin(
        { airport, visitedOn, kind, rating, ratings, comment, travel, photos },
        setSaving
      );
      if (failedPhotos) toast.error(`${failedPhotos} foto(n) kunde inte laddas upp.`);
      toast.show(`Incheckad på ${airport.iata}!`);
      navigate(`/airport/${airport.iata}`, { state: { newBadges: checkin.newBadges || [] } });
    } catch (err) {
      toast.error(err);
      setSaving(null);
    }
  };

  return (
    <div className="page">
      <header className="page__header">
        <h1 className="page__title">Checka in</h1>
        <p className="page__subtitle">Logga ett flygplatsbesök och betygsätt upplevelsen.</p>
      </header>

      <form className="card" onSubmit={submit} noValidate>
        <div className="card__body stack stack--lg">
          <AirportAutocomplete
            label="Flygplats"
            value={airport}
            onSelect={setAirport}
            autoFocus={!preIata}
            required
            error={errors.airport}
          />

          <div className="field">
            <label className="field__label" htmlFor="visitedOn">
              Datum
            </label>
            <input
              id="visitedOn"
              className="input"
              type="date"
              max={today}
              value={visitedOn}
              onChange={(e) => setVisitedOn(e.target.value)}
              aria-invalid={errors.visitedOn ? true : undefined}
              aria-describedby={errors.visitedOn ? 'visitedOn-err' : undefined}
              required
            />
            {errors.visitedOn && (
              <div className="field__error" id="visitedOn-err">
                {errors.visitedOn}
              </div>
            )}
          </div>

          <div className="field">
            <span className="field__label">Typ av besök</span>
            <Segmented options={KINDS} value={kind} onChange={setKind} label="Typ av besök" name="kind" />
          </div>

          <div className="field">
            <span className="field__label">Totalbetyg</span>
            <StarsInput value={rating} onChange={setRating} label="Totalbetyg" />
            <span className="field__hint">Tryck på vänster halva av en stjärna för halvt betyg. Valfritt.</span>
          </div>

          <div className="field">
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              aria-expanded={showSubs}
              aria-controls="subratings"
              onClick={() => setShowSubs((v) => !v)}
              style={{ alignSelf: 'flex-start' }}
            >
              {showSubs ? 'Dölj delbetyg' : 'Lägg till delbetyg'}
            </button>
            {showSubs && (
              <div id="subratings" className="stack" style={{ marginTop: 8 }}>
                {SUB_RATINGS.map((s) => (
                  <div key={s.key} className="row row--between" style={{ alignItems: 'center' }}>
                    <span>{s.label}</span>
                    <StarsInput
                      half={false}
                      size="1.6rem"
                      value={ratings[s.key] ?? null}
                      onChange={(v) => setRatings((r) => ({ ...r, [s.key]: v }))}
                      label={s.label}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="field">
            <label className="field__label" htmlFor="comment">
              Kommentar
            </label>
            <textarea
              id="comment"
              className="textarea"
              rows={4}
              maxLength={MAX_COMMENT}
              placeholder="Hur var säkerhetskontrollen, maten, loungen?"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              aria-describedby="comment-count"
            />
            <div
              id="comment-count"
              className={comment.length > MAX_COMMENT - 50 ? 'field__error' : 'field__hint'}
              aria-live="polite"
            >
              {comment.length} / {MAX_COMMENT} tecken
            </div>
          </div>

          <PhotoPicker value={photos} onChange={setPhotos} onError={toast.error} />

          <TravelSection
            v={travel}
            set={(patch) => setTravel((t) => ({ ...t, ...patch }))}
            lounges={lounges}
            airportChosen={!!airport}
            errors={errors}
          />
        </div>
        <div className="card__footer">
          <button type="submit" className="btn btn--primary btn--block" disabled={!!saving}>
            {saving || 'Checka in'}
          </button>
        </div>
      </form>
    </div>
  );
}
