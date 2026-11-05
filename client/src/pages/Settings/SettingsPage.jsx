import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth.jsx';
import { downloadExport } from '../../lib/api.js';
import { useToast } from '../../components/Toast.jsx';
import { THEMES, getTheme, setTheme } from '../../lib/theme.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { Segmented } from '../../components/ui.jsx';
import { IconLogout } from '../../assets/icons.jsx';
import { ProfileForm } from './ProfileForm.jsx';
import { DangerZone } from './DangerZone.jsx';
import { OfflineQueueStatus } from '../../components/OfflineQueueStatus.jsx';

function Section({ id, title, children }) {
  return (
    <section className="card" aria-labelledby={id}>
      <div className="card__body stack">
        <h2 className="section__title mt-0 mb-0" id={id}>
          {title}
        </h2>
        {children}
      </div>
    </section>
  );
}

export default function SettingsPage() {
  useDocumentTitle('Inställningar');
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [theme, setThemeState] = useState(getTheme);
  const toast = useToast();

  return (
    <div className="page">
      <header className="page__header">
        <h1 className="page__title">Inställningar</h1>
      </header>
      <div className="stack stack--lg">
        <Section id="set-account" title="Konto">
          <p className="muted mt-0 mb-0">
            Inloggad som <Link to={`/u/${user.username}`}>@{user.username}</Link>
          </p>
          <ProfileForm />
        </Section>

        <Section id="set-theme" title="Utseende">
          <div className="field">
            <span className="field__label" id="theme-label">
              Tema
            </span>
            <Segmented
              name="theme"
              label="Tema"
              options={THEMES}
              value={theme}
              onChange={(t) => {
                setTheme(t);
                setThemeState(t);
              }}
            />
          </div>
        </Section>

        <Section id="set-data" title="Din data">
          <p className="muted mt-0 mb-0">
            Ladda ner allt du har loggat (check-ins, recensioner, kommentarer, önskelista och följningar) som JSON.
          </p>
          <div>
            <button type="button" className="btn btn--sm" onClick={() => downloadExport().catch((e) => toast.error(e))}>
              Exportera mina data
            </button>
          </div>
        </Section>

        <Section id="set-offline" title="Offline">
          <OfflineQueueStatus showEmpty />
        </Section>

        <Section id="set-about" title="Om Gatelog">
          <Link to="/about">Om appen, datakällor och licenser</Link>
        </Section>

        <Section id="set-session" title="Session">
          <div>
            <button
              type="button"
              className="btn btn--block"
              onClick={() => {
                logout();
                navigate('/', { replace: true });
              }}
            >
              <IconLogout size={18} aria-hidden="true" /> Logga ut
            </button>
          </div>
          <DangerZone />
        </Section>
      </div>
    </div>
  );
}
