import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { wasReported } from './utils/reportError';
import './index.css';

// Errors the stores already surfaced as toasts re-throw for callers that want
// them; when nobody does, keep them out of the console/error tooling.
window.addEventListener('unhandledrejection', (event) => {
  if (wasReported(event.reason)) {
    event.preventDefault();
  }
});

// The service worker keeps the app shell available offline (and shows push
// notifications). Production builds only: in development it would serve
// stale modules.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* the app works without it, just not offline */
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
        <App />
    </ErrorBoundary>
  </React.StrictMode>
);
