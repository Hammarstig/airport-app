import { Suspense, useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { Layout, RequireAuth } from './components/Layout.jsx';
import { PageSkeleton } from './components/Skeleton.jsx';
import { RouteErrorBoundary } from './components/RouteErrorBoundary.jsx';
import FeedPage from './pages/Feed/FeedPage.jsx';
import { loadOfflineList, loaders, pages } from './routes.js';
import { afterLoadIdle, installLinkPrefetch, isStandalone, prefetchLikelyNext } from './lib/prefetch.js';

// Startsidan (flödet) laddas direkt, övriga sidor delas upp per route (se routes.js).
const {
  checkin: CheckinPage,
  done: DonePage,
  settings: SettingsPage,
  notifications: NotificationsPage,
  follow: FollowPage,
  checkinDetail: CheckinDetailPage,
  about: AboutPage,
  airport: AirportPage,
  profile: ProfilePage,
  map: MapPage,
  leaderboard: LeaderboardPage,
  search: SearchPage,
  country: CountryPage,
  top: TopPage,
  lounge: LoungePage,
  login: LoginPage,
  register: RegisterPage,
  moderation: ModerationPage,
  notFound: NotFoundPage
} = pages;

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

/**
 * Förhämtning: vid pekare/fokus på länkar (användarens avsikt), och 3 s efter load bara koden för
 * troligaste nästa steg. I installerad app hämtas dessutom offlinedata när appen har varit ledig en stund.
 */
function usePrefetch() {
  const { pathname } = useLocation();
  useEffect(() => installLinkPrefetch(), []);
  useEffect(() => afterLoadIdle(() => prefetchLikelyNext(pathname)), [pathname]);
  useEffect(
    () =>
      isStandalone()
        ? afterLoadIdle(() => {
            loaders.done().catch(() => {});
            loadOfflineList().catch(() => {});
          }, 10000)
        : undefined,
    []
  );
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
  usePrefetch();
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
          <Route path="settings/:section" element={auth(<SettingsPage />)} />
          <Route path="notifications" element={auth(<NotificationsPage />)} />
          <Route path="u/:username/followers" element={s(<FollowPage list="followers" />)} />
          <Route path="u/:username/following" element={s(<FollowPage list="following" />)} />
          <Route path="about" element={s(<AboutPage />)} />
          <Route path="moderation" element={auth(<ModerationPage />)} />
          <Route path="airport/:iata" element={s(<AirportPage />)} />
          <Route path="u/:username" element={s(<ProfilePage />)} />
          <Route path="u/:username/map" element={s(<MapPage />)} />
          <Route path="u/:username/map/:country" element={s(<MapPage />)} />
          <Route path="leaderboard" element={s(<LeaderboardPage />)} />
          <Route path="search" element={s(<SearchPage />)} />
          <Route path="explore" element={s(<SearchPage />)} />
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
