import {createRoot} from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/plus-jakarta-sans';
import App from './App.tsx';
import { APP_CHANGE_CODE } from './config/appVersion';
import './index.css';

if (typeof window !== 'undefined' && typeof navigator !== 'undefined') {
  const SW_CACHE_VERSION_KEY = 'vlo_sw_purged_change_code_v1';
  const prevCode = (() => {
    try {
      return window.localStorage.getItem(SW_CACHE_VERSION_KEY);
    } catch {
      return null;
    }
  })();

  if (prevCode !== APP_CHANGE_CODE || import.meta.env.DEV) {
    try {
      window.localStorage.setItem(SW_CACHE_VERSION_KEY, APP_CHANGE_CODE);
    } catch {}
    const hadController = Boolean(navigator.serviceWorker?.controller);
    const cleanupPromises: Promise<unknown>[] = [];
    if ('serviceWorker' in navigator) {
      cleanupPromises.push(
        navigator.serviceWorker
          .getRegistrations()
          .then((registrations) =>
            Promise.all(registrations.map((reg) => reg.unregister().catch(() => false)))
          )
          .catch(() => {})
      );
    }
    if ('caches' in window) {
      cleanupPromises.push(
        window.caches
          .keys()
          .then((keys) =>
            Promise.all(
              keys
                .filter((k) => k.includes('workbox') || k.includes('precache'))
                .map((k) => window.caches.delete(k).catch(() => false))
            )
          )
          .catch(() => {})
      );
    }
    if (hadController && prevCode && prevCode !== APP_CHANGE_CODE) {
      Promise.all(cleanupPromises).finally(() => {
        window.location.reload();
      });
    }
  }
}

createRoot(document.getElementById('root')!).render(<App />);
