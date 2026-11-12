import { Suspense, useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { Layout, RequireAuth } from './components/Layout.jsx';
import { PageSkeleton } from './components/Skeleton.jsx';
import { RouteErrorBoundary } from './components/RouteErrorBoundary.jsx';
import FeedPage from './pages/Feed/FeedPage.jsx';
import { loadOfflineList, loaders, pages } from './routes.js';
import { afterLoadIdle, installLinkPrefetch, isStandalone, preloadNavChunks } from './lib/prefetch.js';

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
 * Efter load och när webbläsaren är ledig: förhämta menyns sidor, och länkförhämtning vid
 * hover/tryck. Offlinelistan förladdas bara i installerad app (check-in-sidan laddar den själv).
 * Inget av detta konkurrerar med första laddningen.
 */
function usePrefetch() {
  useEffect(() => installLinkPrefetch(), []);
  useEffect(
    () =>
      afterLoadIdle(() => {
        preloadNavChunks();
        if (isStandalone()) {
          loaders.done().catch(() => {});
          loadOfflineList().catch(() => {});
        }
      }),
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
