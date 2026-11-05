import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useToast } from '../../components/Toast.jsx';
import { AirportAutocomplete } from '../../components/AirportAutocomplete.jsx';

/** Visningsnamn och hemmaflygplats för inloggad användare. */
export function ProfileForm() {
  const toast = useToast();
  const { user, setUser } = useAuth();
  const [displayName, setDisplayName] = useState(user.displayName || '');
  const [home, setHome] = useState(null);
  const [homeCleared, setHomeCleared] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user.homeIata) return;
    api
      .airport(user.homeIata)
      .then(setHome)
      // Visa åtminstone koden om flygplatsen inte gick att hämta.
      .catch(() => setHome({ iata: user.homeIata, name: user.homeIata }));
  }, [user.homeIata]);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body = { displayName: displayName.trim() };
      if (home) body.homeIata = home.iata;
      else if (homeCleared) body.homeIata = null;
      setUser(await api.updateMe(body));
      toast.show('Profilen sparad.');
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="stack" onSubmit={submit} aria-label="Profil">
      <div className="field">
        <label className="field__label" htmlFor="displayName">
          Visningsnamn
        </label>
        <input
          id="displayName"
          className="input"
          value={displayName}
          maxLength={50}
          autoComplete="name"
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
      <div>
        <button type="submit" className="btn btn--primary btn--sm" disabled={saving}>
          {saving ? 'Sparar...' : 'Spara profil'}
        </button>
      </div>
    </form>
  );
}
