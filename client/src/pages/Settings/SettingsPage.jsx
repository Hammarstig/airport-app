import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../lib/auth.jsx';
import { downloadExport } from '../../lib/api.js';
import { useToast } from '../../components/Toast.jsx';
import { THEMES, getTheme, setTheme } from '../../lib/theme.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { Segmented } from '../../components/ui.jsx';
import {
  IconBell,
  IconChevronLeft,
  IconLock,
  IconLogout,
  IconShield,
  IconTicket,
  IconUser
} from '../../assets/icons.jsx';
import { ProfileForm } from './ProfileForm.jsx';
import { DangerZone } from './DangerZone.jsx';
import { OfflineQueueStatus } from '../../components/OfflineQueueStatus.jsx';
import { FollowRequests } from '../../components/FollowRequests.jsx';
import { PrivacySection, useSettings } from './PrivacySection.jsx';
import { PushSection } from './PushSection.jsx';
import { PasswordForm } from './PasswordForm.jsx';
import { SessionsSection } from './SessionsSection.jsx';
import { BlocksSection } from './BlocksSection.jsx';
import { ImportSection } from './ImportSection.jsx';
import { InviteSection } from './InviteSection.jsx';
import NotFoundPage from '../NotFound/NotFoundPage.jsx';

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

function ThemeField() {
  const [theme, setThemeState] = useState(getTheme);
  return (
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
  );
}

function AccountPage() {
  const { user } = useAuth();
  return (
    <>
      <Section id="set-profile" title="Profil">
        <p className="muted mt-0 mb-0">
          Inloggad som <Link to={`/u/${user.username}`}>@{user.username}</Link>
        </p>
        <ProfileForm />
      </Section>
      <InviteSection />
      <Section id="set-theme" title="Utseende">
        <ThemeField />
      </Section>
    </>
  );
}

function PrivacyPage() {
  const settings = useSettings();
  return (
    <>
      <FollowRequests />
      <Section id="set-privacy" title="Synlighet">
        <PrivacySection settings={settings} />
      </Section>
      <Section id="set-blocks" title="Blockerade">
        <BlocksSection />
      </Section>
    </>
  );
}

function NotificationsSettingsPage() {
  const settings = useSettings();
  return (
    <Section id="set-push" title="Notiser">
      <PushSection settings={settings} />
    </Section>
  );
}

function SecurityPage() {
  return (
    <>
      <Section id="set-password" title="Lösenord">
        <PasswordForm />
      </Section>
      <Section id="set-sessions" title="Inloggade enheter">
        <SessionsSection />
      </Section>
    </>
  );
}

function DataPage() {
  const toast = useToast();
  return (
    <>
      <Section id="set-import" title="Importera resehistorik">
        <ImportSection />
      </Section>
      <Section id="set-export" title="Exportera">
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
      <Section id="set-delete" title="Radera konto">
        <DangerZone />
      </Section>
    </>
  );
}

// Undersidor: sökväg, rubrik, beskrivning i listan, ikon, innehåll.
const SUBPAGES = [
  ['konto', 'Konto', 'Profil, inbjudningar och tema', IconUser, AccountPage],
  ['integritet', 'Integritet', 'Privat profil, synlighet, följförfrågningar och blockeringar', IconLock, PrivacyPage],
  ['notiser', 'Notiser', 'Pushnotiser och vad du vill få veta', IconBell, NotificationsSettingsPage],
  ['sakerhet', 'Säkerhet', 'Lösenord och inloggade enheter', IconShield, SecurityPage],
  ['data', 'Data', 'Import, export, offlinekö och radering', IconTicket, DataPage]
];

function SettingsIndex() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="stack stack--lg">
      <FollowRequests />
      <nav aria-label="Inställningar">
        <ul className="list card">
          {SUBPAGES.map(([path, title, desc, Icon]) => (
            <li key={path}>
              <Link to={`/settings/${path}`} className="list__item">
                <Icon size={20} aria-hidden="true" />
                <span className="flex-1 min-w-0">
                  <span className="bold block">{title}</span>
                  <span className="muted text-sm block">{desc}</span>
                </span>
                <IconChevronLeft size={18} aria-hidden="true" style={{ transform: 'scaleX(-1)' }} />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <Section id="set-about" title="Om Gatelog">
        <Link to="/about">Om appen, datakällor och licenser</Link>
        {user.isModerator && <Link to="/moderation">Modereringskö</Link>}
      </Section>
      <div>
        <button
          type="button"
          className="btn btn--block"
          onClick={async () => {
            await logout();
            navigate('/', { replace: true });
          }}
        >
          <IconLogout size={18} aria-hidden="true" /> Logga ut
        </button>
      </div>
    </div>
  );
}

/** Inställningar: en översikt med undersidor (Konto, Integritet, Notiser, Säkerhet, Data). */
export default function SettingsPage() {
  const { section } = useParams();
  const sub = section ? SUBPAGES.find(([path]) => path === section) : null;
  useDocumentTitle(sub ? `${sub[1]} - Inställningar` : 'Inställningar');
  if (section && !sub) return <NotFoundPage />;
  const Body = sub?.[4];

  return (
    <div className="page">
      <header className="page__header">
        <h1 className="page__title">{sub ? sub[1] : 'Inställningar'}</h1>
      </header>
      {Body ? (
        <div className="stack stack--lg">
          <Body />
        </div>
      ) : (
        <SettingsIndex />
      )}
    </div>
  );
}
