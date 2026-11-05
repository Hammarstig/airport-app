import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { todayIso } from '../../lib/format.js';

export const MAX_COMMENT = 1000;
const EMPTY_TRAVEL = {
  airline: null,
  flightNumber: '',
  travelClass: '',
  loungeChoice: '',
  newLounge: { name: '', terminal: '' },
  loungeRating: null
};

function fromCheckin(c) {
  return {
    airport: c.airport,
    visitedOn: c.visitedOn,
    kind: c.kind,
    rating: c.rating,
    ratings: Object.fromEntries(Object.entries(c.ratings || {}).filter(([, v]) => v != null)),
    comment: c.comment || '',
    travel: {
      ...EMPTY_TRAVEL,
      airline: c.airline,
      flightNumber: c.flightNumber || '',
      travelClass: c.travelClass || '',
      loungeChoice: c.lounge ? String(c.lounge.id) : ''
    },
    existingPhotos: c.photos || []
  };
}

const initial = (preset) => ({
  airport: null,
  visitedOn: preset.date || todayIso(),
  kind: preset.kind || 'departure',
  rating: null,
  ratings: {},
  comment: '',
  travel: EMPTY_TRAVEL,
  existingPhotos: []
});

/** Formulärets state. editId laddar en befintlig check-in. preset: { iata, date, kind } från URL:en. */
export function useCheckinForm(editId, preset) {
  const [f, setF] = useState(() => initial(preset));
  const [photos, setPhotos] = useState([]);
  const [removedPhotos, setRemovedPhotos] = useState([]);
  const [lounges, setLounges] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(!!editId);
  const set = (patch) => setF((cur) => ({ ...cur, ...(typeof patch === 'function' ? patch(cur) : patch) }));

  useEffect(() => {
    if (!editId) return;
    let live = true;
    setLoading(true);
    api
      .checkin(editId)
      .then((c) => live && setF(fromCheckin(c)))
      .catch((e) => live && setLoadError(e))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [editId]);

  useEffect(() => {
    if (editId || !/^[A-Z]{3}$/.test(preset.iata || '')) return;
    let live = true;
    api
      .airport(preset.iata)
      .then((a) => live && set({ airport: a }))
      .catch((e) => live && setLoadError(e));
    return () => {
      live = false;
    };
  }, [preset.iata, editId]);

  // Lounger för vald flygplats (flygplatsobjektet från /airports/:iata har dem redan).
  const iata = f.airport?.iata;
  useEffect(() => {
    if (!editId) set((cur) => ({ travel: { ...cur.travel, loungeChoice: '', loungeRating: null } }));
    if (!iata) return setLounges([]);
    if (f.airport.lounges) return setLounges(f.airport.lounges);
    let live = true;
    api
      .airport(iata)
      .then((a) => live && setLounges(a.lounges || []))
      .catch((e) => {
        console.warn('Lounger kunde inte hämtas:', e.message);
        if (live) setLounges([]);
      });
    return () => {
      live = false;
    };
  }, [iata]); // eslint-disable-line react-hooks/exhaustive-deps -- laddas bara om när flygplatsen byts

  return {
    f,
    set,
    setTravel: (patch) => set((cur) => ({ travel: { ...cur.travel, ...patch } })),
    photos,
    setPhotos,
    removedPhotos,
    removeExisting: (id) => {
      setRemovedPhotos((r) => [...r, id]);
      set((cur) => ({ existingPhotos: cur.existingPhotos.filter((p) => p.id !== id) }));
    },
    lounges,
    loading,
    loadError
  };
}

export function validate(f) {
  const errs = {};
  const today = todayIso();
  if (!f.airport) errs.airport = 'Välj en flygplats.';
  if (!f.visitedOn) errs.visitedOn = 'Ange datum.';
  else if (f.visitedOn > today) errs.visitedOn = 'Datumet kan inte vara i framtiden.';
  if (f.comment.length > MAX_COMMENT) errs.comment = `Max ${MAX_COMMENT} tecken.`;
  const t = f.travel;
  if (t.flightNumber && !/^[A-Z0-9]{2,8}$/.test(t.flightNumber))
    errs.flightNumber = 'Ange t.ex. SK1421 (2-8 tecken A-Z, 0-9).';
  if (t.loungeChoice === 'new' && !t.newLounge.name.trim()) errs.newLounge = 'Ange loungens namn.';
  return errs;
}
