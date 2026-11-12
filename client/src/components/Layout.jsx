import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { NotificationBell } from './NotificationBell.jsx';
import { OfflineBanner } from './OfflineBanner.jsx';
import logoUrl from '../assets/logo.svg';
import {
  IconChevronLeft,
  IconHome,
  IconPlus,
  IconSearch,
  IconSettings,
  IconTrophy,
  IconUser
} from '../assets/icons.jsx';

function navItems(user) {
  return [
    { to: '/', label: 'Flöde', icon: IconHome, end: true },
    { to: '/search', label: 'Utforska', icon: IconSearch, also: ['/explore', '/country', '/top'] },
    { to: '/checkin', label: 'Checka in', icon: IconPlus, primary: true },
    { to: '/leaderboard', label: 'Topplistor', icon: IconTrophy },
    user
      ? { to: `/u/${user.username}`, label: 'Profil', icon: IconUser }
      : { to: '/login', label: 'Logga in', icon: IconUser }
  ];
}

// Rotsidor (menyns mål, notiser och sammanfattningen) saknar tillbaka-pil; undersidor har den
// (viktigt i installerad PWA där webbläsarens bakåtknapp saknas).
const ROOTS = new Set([
  '/',
  '/search',
  '/explore',
  '/checkin',
  '/checkin/done',
  '/leaderboard',
  '/login',
  '/register',
  '/notifications'
]);

function BackButton({ me }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const canGoBack = typeof window !== 'undefined' && (window.history.state?.idx ?? 0) > 0;
  if (ROOTS.has(pathname) || (me && pathname === `/u/${me}`)) return null;
  return (
    <button
      type="button"
      className="icon-btn topbar__back"
      aria-label="Tillbaka"
      onClick={() => (canGoBack ? navigate(-1) : navigate('/'))}
    >
      <IconChevronLeft size={22} aria-hidden="true" />
    </button>
  );
}

export function Layout() {
  const { user } = useAuth();
  const items = navItems(user);
  const location = useLocation();
  const isActive = (it, active) => active || (it.also || []).some((p) => location.pathname.startsWith(p));

  return (
    <div className="app-shell">
      <a href="#main" className="visually-hidden skip-link">
        Hoppa till innehåll
      </a>
      <header className="topbar">
        <BackButton me={user?.username} />
        <Link to="/" className="topbar__brand" aria-label="Gatelog startsida">
          <img src={logoUrl} alt="Gatelog" height={28} />
        </Link>
        <nav className="topbar__nav" aria-label="Huvudmeny">
          {items.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.end}
              className={({ isActive: a }) =>
                it.primary
                  ? 'btn btn--primary btn--sm'
                  : `topbar__link${isActive(it, a) ? ' topbar__link--active' : ''}`
              }
            >
              {it.label}
            </NavLink>
          ))}
        </nav>
        {user && (
          <div className="topbar__actions">
            <NotificationBell />
            <Link to="/settings" className="icon-btn" aria-label="Inställningar" title="Inställningar">
              <IconSettings size={22} aria-hidden="true" />
            </Link>
          </div>
        )}
      </header>

      <OfflineBanner />

      <main id="main" tabIndex={-1}>
        <Outlet />
      </main>

      <nav className="bottom-nav" aria-label="Huvudmeny mobil">
        {items.map((it) => {
          const Icon = it.icon;
          return (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.end}
              className={({ isActive: a }) =>
                `bottom-nav__item${it.primary ? ' bottom-nav__item--fab' : ''}${isActive(it, a) ? ' bottom-nav__item--active' : ''}`
              }
            >
              <Icon size={it.primary ? 28 : 22} aria-hidden="true" />
              <span>{it.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}

export function RequireAuth({ children }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) {
    return (
      <div className="page" role="status">
        <span className="spinner" aria-hidden="true" />
        <span className="visually-hidden">Laddar</span>
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return children;
}
