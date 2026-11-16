import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './styles/index.css';
import { App } from './App.jsx';
import { AuthProvider, initialUser } from './lib/auth.jsx';
import { ToastProvider } from './components/Toast.jsx';
import { applyTheme } from './lib/theme.js';
import { afterLoadIdle, primeRoute } from './lib/prefetch.js';

applyTheme();
// Sessionstipset sätts före första anropet så att sidans data hämtas inloggad redan här.
initialUser();
primeRoute(window.location.pathname);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>
);

// Service workern registreras först när sidan laddat klart och varit ledig en stund, så att dess
// förcachning inte konkurrerar med första laddningen.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  afterLoadIdle(() => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* PWA är en förbättring - appen fungerar utan */
    });
  }, 2000);
}
