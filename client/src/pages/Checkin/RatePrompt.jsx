import { useState } from 'react';
import { api } from '../../lib/api.js';
import { StarsInput } from '../../components/StarsInput.jsx';
import { useToast } from '../../components/Toast.jsx';

/** "Hur var GOT?" - betyg i efterhand på sammanfattningen när snabb check-in hoppade över det. */
export function RatePrompt({ checkin }) {
  const toast = useToast();
  const [rating, setRating] = useState(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const choose = async (v) => {
    setRating(v);
    if (v == null || busy) return;
    setBusy(true);
    try {
      await api.updateCheckin(checkin.id, { rating: v });
      setSaved(true);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card rate-prompt" aria-labelledby="rate-title">
      <div className="card__body stack stack--sm items-center text-center">
        <h2 className="section__title mt-0 mb-0" id="rate-title">
          Hur var {checkin.airport.iata}?
        </h2>
        <StarsInput value={rating} onChange={choose} label={`Betyg för ${checkin.airport.iata}`} allowClear={false} />
        <p className="muted text-sm mt-0 mb-0" role="status">
          {saved ? 'Tack! Betyget är sparat.' : 'Ett tryck räcker, det hjälper andra resenärer.'}
        </p>
      </div>
    </section>
  );
}
