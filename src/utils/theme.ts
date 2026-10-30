/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';

export type AppTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'tradevault_theme_v1';
export const THEME_CHANGE_EVENT = 'tradevault-theme-change';

/**
 * Reads the persisted theme from localStorage.
 * Defaults to 'dark' if not set or invalid.
 * Guaranteed to never read or overwrite financial data or settings keys.
 */
export function getStoredTheme(): AppTheme {
  try {
    if (typeof window === 'undefined') return 'dark';
    const val = localStorage.getItem(THEME_STORAGE_KEY);
    if (val === 'light') return 'light';
    if (val === 'dark') return 'dark';
    return 'dark'; // Default theme
  } catch {
    return 'dark';
  }
}

/**
 * Persists the user's manual theme choice to localStorage and notifies listeners.
 */
export function setStoredTheme(theme: AppTheme): void {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
      applyThemeToDocument(theme);
      window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: theme }));
    }
  } catch (err) {
    console.warn('Failed to save theme preference:', err);
  }
}

/**
 * Immediately synchronizes HTML classes and meta tags to prevent visual flash.
 */
export function applyThemeToDocument(theme: AppTheme): void {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  if (theme === 'light') {
    root.classList.add('light');
    root.classList.remove('dark');
  } else {
    root.classList.add('dark');
    root.classList.remove('light');
  }

  // Update theme-color meta tag for mobile browsers and PWA header
  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) {
    metaThemeColor.setAttribute('content', theme === 'light' ? '#F5F7FA' : '#080A0E');
  }
}

/**
 * React hook to access and toggle theme across any component.
 */
export function useTheme() {
  const [theme, setCurrentThemeState] = useState<AppTheme>(() => getStoredTheme());

  useEffect(() => {
    // Initial sync
    applyThemeToDocument(theme);

    const handleThemeChange = (e: Event) => {
      const customEvent = e as CustomEvent<AppTheme>;
      if (customEvent.detail) {
        setCurrentThemeState(customEvent.detail);
      } else {
        setCurrentThemeState(getStoredTheme());
      }
    };

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === THEME_STORAGE_KEY && e.newValue) {
        const nextTheme = e.newValue === 'light' ? 'light' : 'dark';
        setCurrentThemeState(nextTheme);
        applyThemeToDocument(nextTheme);
      }
    };

    window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange);
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [theme]);

  const setTheme = useCallback((nextTheme: AppTheme) => {
    setCurrentThemeState(nextTheme);
    setStoredTheme(nextTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    const nextTheme: AppTheme = theme === 'dark' ? 'light' : 'dark';
    setCurrentThemeState(nextTheme);
    setStoredTheme(nextTheme);
  }, [theme]);

  return {
    theme,
    isDark: theme === 'dark',
    isLight: theme === 'light',
    setTheme,
    toggleTheme,
  };
}
