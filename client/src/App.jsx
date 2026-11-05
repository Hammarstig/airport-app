import { Suspense, lazy, useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { Layout, RequireAuth } from './components/Layout.jsx';
import { PageSkeleton } from './components/Skeleton.jsx';
import FeedPage from './pages/Feed/FeedPage.jsx';

// Startsidan (flödet) laddas direkt, övriga sidor delas upp per route.
const CheckinPage = lazy(() => import('./pages/Checkin/CheckinPage.jsx'));
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

const s = (el) => <Suspense fallback={<PageSkeleton />}>{el}</Suspense>;

export function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<FeedPage />} />
          <Route
            path="checkin"
            element={s(
              <RequireAuth>
                <CheckinPage />
              </RequireAuth>
            )}
          />
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
