import { useCallback, useEffect, useState } from 'react';

import { readStoredValue, writeStoredValue } from '../utils/storage';
import { useMediaQuery } from './useMediaQuery';

export type ThemePreference = 'dark' | 'light' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'bibliamap-theme';

/** BibliaMap is dark-first: with no stored choice the app is dark, whatever the OS says. */
export const DEFAULT_THEME: ThemePreference = 'dark';

/** Order the ThemeToggle steps through. */
export const THEME_ORDER: readonly ThemePreference[] = [ 'dark', 'light', 'system' ];

/** Must match --bg in styles/tokens.css. */
const THEME_COLORS: Record<ResolvedTheme, string> = { light: '#f3f4f1', dark: '#0d1015' };

function isPreference(value: string | null): value is ThemePreference {
   return value === 'dark' || value === 'light' || value === 'system';
}

export function readThemePreference(): ThemePreference {
   const stored = readStoredValue(THEME_STORAGE_KEY);

   return isPreference(stored) ? stored : DEFAULT_THEME;
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
   /** What the user chose: 'dark' until they pick something else. */
   preference: ThemePreference;
   /** What is actually on screen. */
   resolved: ResolvedTheme;
   setPreference: (preference: ThemePreference) => void;
   /** Flip to the opposite of what is on screen and remember it. */
   toggle: () => void;
   /** Step to the next preference: dark → light → system → dark. */
   cycle: () => void;
}

/**
 * Theme state. Dark is the default; the user can pick light or "system" (follow the OS) and the
 * choice is remembered. index.html applies the stored preference before first paint; this hook
 * keeps <html data-theme>, localStorage and the theme-color meta in sync.
 */
export function useTheme(): ThemeState {
   const [ preference, setPreferenceState ] = useState<ThemePreference>(readThemePreference);
   const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
   const resolved: ResolvedTheme = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;

   useEffect(() => {
      applyTheme(preference, resolved);
   }, [ preference, resolved ]);

   const setPreference = useCallback((next: ThemePreference): void => {
      // Storage can be unavailable (private mode); the choice still applies for this visit.
      writeStoredValue(THEME_STORAGE_KEY, next);
      setPreferenceState(next);
   }, []);

   const toggle = useCallback((): void => {
      setPreference(resolved === 'dark' ? 'light' : 'dark');
   }, [ resolved, setPreference ]);

   const cycle = useCallback((): void => {
      setPreference(THEME_ORDER[(THEME_ORDER.indexOf(preference) + 1) % THEME_ORDER.length]);
   }, [ preference, setPreference ]);

   return { preference, resolved, setPreference, toggle, cycle };
}
