import { Suspense, lazy, useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { Layout, RequireAuth } from './components/Layout.jsx';
import { PageSkeleton } from './components/Skeleton.jsx';
import { RouteErrorBoundary } from './components/RouteErrorBoundary.jsx';
import FeedPage from './pages/Feed/FeedPage.jsx';

// Startsidan (flödet) laddas direkt, övriga sidor delas upp per route.
const loadCheckin = () => import('./pages/Checkin/CheckinPage.jsx');
const loadDone = () => import('./pages/Checkin/DonePage.jsx');
const loadOfflineList = () => import('./data/airports-offline.json');
const CheckinPage = lazy(loadCheckin);
const DonePage = lazy(loadDone);
const SettingsPage = lazy(() => import('./pages/Settings/SettingsPage.jsx'));
const NotificationsPage = lazy(() => import('./pages/Notifications/NotificationsPage.jsx'));
const FollowPage = lazy(() => import('./pages/Profile/FollowPage.jsx'));
const CheckinDetailPage = lazy(() => import('./pages/CheckinDetail/CheckinDetailPage.jsx'));
const AboutPage = lazy(() => import('./pages/About/AboutPage.jsx'));
const AirportPage = lazy(() => import('./pages/Airport/AirportPage.jsx'));
const ProfilePage = lazy(() => import('./pages/Profile/ProfilePage.jsx'));
const MapPage = lazy(() => import('./pages/Map/MapPage.jsx'));
const LeaderboardPage = lazy(() => import('./pages/Leaderboard/LeaderboardPage.jsx'));
const SearchPage = lazy(() => import('./pages/Search/SearchPage.jsx'));
const ExplorePage = lazy(() => import('./pages/Explore/ExplorePage.jsx'));
const CountryPage = lazy(() => import('./pages/Country/CountryPage.jsx'));
const TopPage = lazy(() => import('./pages/Top/TopPage.jsx'));
const LoungePage = lazy(() => import('./pages/Lounge/LoungePage.jsx'));
const LoginPage = lazy(() => import('./pages/Auth/LoginPage.jsx'));
const RegisterPage = lazy(() => import('./pages/Auth/RegisterPage.jsx'));
const NotFoundPage = lazy(() => import('./pages/NotFound/NotFoundPage.jsx'));

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

/**
 * Förladda koden för check-in-flödet när webbläsaren är ledig efter första renderingen, så att
 * check-in och sammanfattningen fungerar offline även innan service workern har cachat (BUG-11).
 */
function usePreloadCritical() {
  useEffect(() => {
    const run = () =>
      Promise.all([loadCheckin(), loadDone(), loadOfflineList()]).catch((e) =>
        console.warn('Förladdning misslyckades:', e.message)
      );
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(run, { timeout: 3000 });
      return () => window.cancelIdleCallback(id);
    }
    const t = setTimeout(run, 1500);
    return () => clearTimeout(t);
  }, []);
}

function Page({ children }) {
  const { pathname } = useLocation();
  return (
    <RouteErrorBoundary resetKey={pathname}>
      <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
    </RouteErrorBoundary>
  );
}

const s = (el) => <Page>{el}</Page>;
const auth = (el) => s(<RequireAuth>{el}</RequireAuth>);

export function App() {
  usePreloadCritical();
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route element={<Layout />}>
          <Route index element={s(<FeedPage />)} />
          <Route path="checkin" element={auth(<CheckinPage />)} />
          <Route path="checkin/done" element={auth(<DonePage />)} />
          <Route path="checkin/:id/edit" element={auth(<CheckinPage />)} />
          <Route path="c/:id" element={s(<CheckinDetailPage />)} />
          <Route path="settings" element={auth(<SettingsPage />)} />
          <Route path="notifications" element={auth(<NotificationsPage />)} />
          <Route path="u/:username/followers" element={s(<FollowPage list="followers" />)} />
          <Route path="u/:username/following" element={s(<FollowPage list="following" />)} />
          <Route path="about" element={s(<AboutPage />)} />
          <Route path="airport/:iata" element={s(<AirportPage />)} />
          <Route path="u/:username" element={s(<ProfilePage />)} />
          <Route path="u/:username/map" element={s(<MapPage />)} />
          <Route path="u/:username/map/:country" element={s(<MapPage />)} />
          <Route path="leaderboard" element={s(<LeaderboardPage />)} />
          <Route path="search" element={s(<SearchPage />)} />
          <Route path="explore" element={s(<ExplorePage />)} />
          <Route path="country/:code" element={s(<CountryPage />)} />
          <Route path="top/:category" element={s(<TopPage />)} />
          <Route path="lounge/:id" element={s(<LoungePage />)} />
          <Route path="login" element={s(<LoginPage />)} />
          <Route path="register" element={s(<RegisterPage />)} />
          <Route path="*" element={s(<NotFoundPage />)} />
        </Route>
      </Routes>
    </>
  );
}
