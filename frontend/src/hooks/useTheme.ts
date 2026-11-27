import { useCallback, useEffect, useState } from 'react';

import { useMediaQuery } from './useMediaQuery';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'bibliamap-theme';

/** Must match --bg in styles/tokens.css. */
const THEME_COLORS: Record<ResolvedTheme, string> = { light: '#f3f4f1', dark: '#0d1015' };

function readPreference(): ThemePreference {
   try {
      const stored = window.localStorage.getItem(THEME_STORAGE_KEY);

      return stored === 'light' || stored === 'dark' ? stored : 'system';
   } catch {
      return 'system';
   }
}

/** Write the preference to <html data-theme> (absent = follow the OS) and the theme-color meta. */
export function applyTheme(preference: ThemePreference, resolved: ResolvedTheme): void {
   const root = document.documentElement;

   if (preference === 'system') {
      root.removeAttribute('data-theme');
   } else {
      root.setAttribute('data-theme', preference);
   }

   document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[resolved]);
}

export interface ThemeState {
   /** What the user chose: 'system' until they pick. */
   preference: ThemePreference;
   /** What is actually on screen. */
   resolved: ResolvedTheme;
   setPreference: (preference: ThemePreference) => void;
   /** Flip to the opposite of what is on screen and remember it. */
   toggle: () => void;
}

/**
 * Theme state. index.html applies the stored preference before first paint;
 * this hook keeps <html data-theme>, localStorage and the theme-color meta in sync.
 */
export function useTheme(): ThemeState {
   const [ preference, setPreferenceState ] = useState<ThemePreference>(readPreference);
   const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
   const resolved: ResolvedTheme = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;

   useEffect(() => {
      applyTheme(preference, resolved);
   }, [ preference, resolved ]);

   const setPreference = useCallback((next: ThemePreference): void => {
      try {
         if (next === 'system') {
            window.localStorage.removeItem(THEME_STORAGE_KEY);
         } else {
            window.localStorage.setItem(THEME_STORAGE_KEY, next);
         }
      } catch {
         // Storage can be unavailable (private mode); the choice still applies for this visit.
      }

      setPreferenceState(next);
   }, []);

   const toggle = useCallback((): void => {
      setPreference(resolved === 'dark' ? 'light' : 'dark');
   }, [ resolved, setPreference ]);

   return { preference, resolved, setPreference, toggle };
}
