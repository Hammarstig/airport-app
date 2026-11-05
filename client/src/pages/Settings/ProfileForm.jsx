import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useToast } from '../../components/Toast.jsx';
import { AirportAutocomplete } from '../../components/AirportAutocomplete.jsx';

export function EditProfile({ profile, onSaved, onCancel }) {
  const toast = useToast();
  const { setUser } = useAuth();
  const [displayName, setDisplayName] = useState(profile.displayName || '');
  const [home, setHome] = useState(null);
  const [homeCleared, setHomeCleared] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile.homeIata)
      api
        .airport(profile.homeIata)
        .then(setHome)
        .catch(() => {});
  }, [profile.homeIata]);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body = { displayName: displayName.trim() };
      if (home) body.homeIata = home.iata;
      else if (homeCleared) body.homeIata = null;
      const u = await api.updateMe(body);
      setUser(u);
      toast.show('Profilen uppdaterad.');
      onSaved(u);
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="card" onSubmit={submit} aria-label="Redigera profil">
      <div className="card__body stack">
        <div className="field">
          <label className="field__label" htmlFor="displayName">
            Visningsnamn
          </label>
          <input
            id="displayName"
            className="input"
            value={displayName}
            maxLength={50}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>
        <AirportAutocomplete
          label="Hemmaflygplats"
          value={home}
          onSelect={(a) => {
            setHome(a);
            if (!a) setHomeCleared(true);
          }}
        />
        <div className="row">
          <button type="submit" className="btn btn--primary btn--sm" disabled={saving}>
            {saving ? 'Sparar...' : 'Spara'}
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel}>
            Avbryt
          </button>
        </div>
      </div>
    </form>
  );
}
