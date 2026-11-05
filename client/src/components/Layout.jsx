import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Suspense, lazy } from 'react';

import { useAuth } from '../lib/auth.jsx';
import { AirportAutocomplete } from './AirportAutocomplete.jsx';
import logoUrl from '../assets/logo.svg';
import { IconHome, IconLogout, IconMapPin, IconPlus, IconSearch, IconTrophy, IconUser } from '../assets/icons.jsx';

const BadgeUnlockModal = lazy(() => import('./Badges.jsx').then((m) => ({ default: m.BadgeUnlockModal })));

function navItems(user) {
  return [
    { to: '/', label: 'Flöde', icon: IconHome, end: true },
    { to: '/search', label: 'Sök', icon: IconSearch },
    { to: '/checkin', label: 'Checka in', icon: IconPlus, primary: true },
    { to: '/explore', label: 'Utforska', icon: IconMapPin },
    { to: '/leaderboard', label: 'Topplistor', icon: IconTrophy, desktopOnly: true },
    user
      ? { to: `/u/${user.username}`, label: 'Profil', icon: IconUser }
      : { to: '/login', label: 'Logga in', icon: IconUser }
  ];
}

export function Layout() {
  const { user, logout } = useAuth();
  const items = navItems(user);
  const location = useLocation();
  const navigate = useNavigate();
  const newBadges = location.state?.newBadges;
  const closeBadges = () => navigate(location.pathname + location.search, { replace: true, state: null });

  return (
    <div className="app-shell">
      <a href="#main" className="visually-hidden skip-link">
        Hoppa till innehåll
      </a>
      <header className="topbar">
        <Link to="/" className="topbar__brand" aria-label="Gatelog startsida">
          <img src={logoUrl} alt="Gatelog" height={28} />
        </Link>
        <nav className="topbar__nav" aria-label="Huvudmeny">
          <div style={{ width: 280, marginRight: 8 }} role="search">
            <AirportAutocomplete
              key={location.pathname}
              id="topbar-search"
              label="Sök flygplats"
              hideLabel
              value={null}
              onSelect={(a) => a && navigate(`/airport/${a.iata}`)}
            />
          </div>
          {items.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.end}
              className={({ isActive }) =>
                it.primary ? 'btn btn--primary btn--sm' : `topbar__link${isActive ? ' topbar__link--active' : ''}`
              }
            >
              {it.label}
            </NavLink>
          ))}
          {user && (
            <button type="button" className="icon-btn" onClick={logout} aria-label="Logga ut" title="Logga ut">
              <IconLogout size={20} aria-hidden="true" />
            </button>
          )}
        </nav>
      </header>

      <main id="main" tabIndex={-1}>
        <Outlet />
      </main>

      {newBadges && newBadges.length > 0 && (
        <Suspense fallback={null}>
          <BadgeUnlockModal badges={newBadges} onClose={closeBadges} />
        </Suspense>
      )}

      <nav className="bottom-nav" aria-label="Huvudmeny mobil">
        {items
          .filter((it) => !it.desktopOnly)
          .map((it) => {
            const Icon = it.icon;
            return (
              <NavLink
                key={it.to}
                to={it.to}
                end={it.end}
                className={({ isActive }) => `bottom-nav__item${isActive ? ' bottom-nav__item--active' : ''}`}
              >
                <Icon size={22} aria-hidden="true" />
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
