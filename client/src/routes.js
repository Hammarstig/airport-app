import { lazy } from 'react';

/** Kodladdare per sida. Delas av React.lazy och förhämtningen (lib/prefetch.js). */
export const loaders = {
  checkin: () => import('./pages/Checkin/CheckinPage.jsx'),
  done: () => import('./pages/Checkin/DonePage.jsx'),
  settings: () => import('./pages/Settings/SettingsPage.jsx'),
  notifications: () => import('./pages/Notifications/NotificationsPage.jsx'),
  follow: () => import('./pages/Profile/FollowPage.jsx'),
  checkinDetail: () => import('./pages/CheckinDetail/CheckinDetailPage.jsx'),
  about: () => import('./pages/About/AboutPage.jsx'),
  airport: () => import('./pages/Airport/AirportPage.jsx'),
  profile: () => import('./pages/Profile/ProfilePage.jsx'),
  map: () => import('./pages/Map/MapPage.jsx'),
  leaderboard: () => import('./pages/Leaderboard/LeaderboardPage.jsx'),
  search: () => import('./pages/Search/SearchPage.jsx'),
  country: () => import('./pages/Country/CountryPage.jsx'),
  top: () => import('./pages/Top/TopPage.jsx'),
  lounge: () => import('./pages/Lounge/LoungePage.jsx'),
  login: () => import('./pages/Auth/LoginPage.jsx'),
  register: () => import('./pages/Auth/RegisterPage.jsx'),
  moderation: () => import('./pages/Moderation/ModerationPage.jsx'),
  year: () => import('./pages/Year/YearPage.jsx'),
  notFound: () => import('./pages/NotFound/NotFoundPage.jsx')
};

export const loadOfflineList = () => import('./data/airports-offline.json');

export const pages = Object.fromEntries(Object.entries(loaders).map(([k, load]) => [k, lazy(load)]));
