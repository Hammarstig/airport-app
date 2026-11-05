import { AirlineAutocomplete } from '../../components/AirportAutocomplete.jsx';
import { StarsInput } from '../../components/StarsInput.jsx';
import { Segmented } from '../../components/ui.jsx';
import { TRAVEL_CLASSES } from '../../lib/format.js';

/**
 * Sektionen "Resedetaljer": flygbolag, flightnummer, reseklass och lounge med betyg.
 * v = { airline, flightNumber, travelClass, loungeChoice ('' | 'new' | id), newLounge: {name, terminal}, loungeRating }
 */
export function TravelSection({ v, set, lounges, airportChosen, errors, allowNewLounge = true }) {
  const classOptions = [{ value: '', label: 'Ingen' }, ...TRAVEL_CLASSES];
  return (
    <fieldset className="stack fieldset-plain">
      <legend className="visually-hidden">Resedetaljer</legend>

      <AirlineAutocomplete value={v.airline} onSelect={(a) => set({ airline: a })} />

      <div className="field">
        <label className="field__label" htmlFor="flightNumber">
          Flightnummer
        </label>
        <input
          id="flightNumber"
          className="input detail-list__mono"
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          placeholder={v.airline ? `${v.airline.iata}1234` : 'SK1421'}
          maxLength={8}
          value={v.flightNumber}
          onChange={(e) => set({ flightNumber: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })}
          aria-invalid={errors.flightNumber ? true : undefined}
          aria-describedby={errors.flightNumber ? 'flightNumber-err' : undefined}
        />
        {errors.flightNumber && (
          <div className="field__error" id="flightNumber-err">
            {errors.flightNumber}
          </div>
        )}
      </div>

      <div className="field">
        <span className="field__label">Reseklass</span>
        <Segmented
          options={classOptions}
          value={v.travelClass}
          onChange={(c) => set({ travelClass: c })}
          label="Reseklass"
          name="travelClass"
        />
      </div>

      <div className="field">
        <label className="field__label" htmlFor="lounge">
          Lounge
        </label>
        <select
          id="lounge"
          className="select"
          value={v.loungeChoice}
          disabled={!airportChosen}
          onChange={(e) => set({ loungeChoice: e.target.value })}
        >
          <option value="">{airportChosen ? 'Ingen lounge' : 'Välj flygplats först'}</option>
          {lounges.map((l) => (
            <option key={l.id} value={String(l.id)}>
              {l.name}
              {l.terminal ? ` (terminal ${l.terminal})` : ''}
            </option>
          ))}
          {airportChosen && allowNewLounge && <option value="new">+ Lägg till ny lounge</option>}
        </select>
      </div>

      {v.loungeChoice === 'new' && (
        <div className="grid grid--2">
          <div className="field">
            <label className="field__label" htmlFor="newLoungeName">
              Loungens namn
            </label>
            <input
              id="newLoungeName"
              className="input"
              maxLength={100}
              value={v.newLounge.name}
              onChange={(e) => set({ newLounge: { ...v.newLounge, name: e.target.value } })}
              aria-invalid={errors.newLounge ? true : undefined}
            />
            {errors.newLounge && <div className="field__error">{errors.newLounge}</div>}
          </div>
          <div className="field">
            <label className="field__label" htmlFor="newLoungeTerminal">
              Terminal (valfritt)
            </label>
            <input
              id="newLoungeTerminal"
              className="input"
              maxLength={40}
              value={v.newLounge.terminal}
              onChange={(e) => set({ newLounge: { ...v.newLounge, terminal: e.target.value } })}
            />
          </div>
        </div>
      )}

      {v.loungeChoice && allowNewLounge && (
        <div className="field">
          <span className="field__label">Loungebetyg</span>
          <StarsInput value={v.loungeRating} onChange={(r) => set({ loungeRating: r })} label="Loungebetyg" />
        </div>
      )}
    </fieldset>
  );
}
