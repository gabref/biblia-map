import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { THEME_STORAGE_KEY, useTheme } from './useTheme';

function mockSystemTheme(system: 'light' | 'dark'): void {
   vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes(`prefers-color-scheme: ${system}`),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
   }));
}

describe('useTheme', () => {
   beforeEach(() => {
      window.localStorage.clear();
      document.documentElement.removeAttribute('data-theme');
      document.head.innerHTML = '<meta name="theme-color" content="#0d1015">';
   });

   afterEach(() => {
      vi.unstubAllGlobals();
   });

   it('defaults to dark with no stored choice, even when the OS is light', () => {
      mockSystemTheme('light');
      const { result } = renderHook(() => useTheme());

      expect(result.current.preference).toBe('dark');
      expect(result.current.resolved).toBe('dark');
      expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
      expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute('content', '#0d1015');
      // Nothing is written until the user chooses.
      expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
   });

   it('restores a stored light choice', () => {
      mockSystemTheme('dark');
      window.localStorage.setItem(THEME_STORAGE_KEY, 'light');
      const { result } = renderHook(() => useTheme());

      expect(result.current.resolved).toBe('light');
      expect(document.documentElement).toHaveAttribute('data-theme', 'light');
      expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute('content', '#f3f4f1');
   });

   it('follows the OS only when "system" was chosen', () => {
      mockSystemTheme('light');
      window.localStorage.setItem(THEME_STORAGE_KEY, 'system');
      const { result } = renderHook(() => useTheme());

      expect(result.current.preference).toBe('system');
      expect(result.current.resolved).toBe('light');
      expect(document.documentElement).not.toHaveAttribute('data-theme');
   });

   it('falls back to dark on an unknown stored value', () => {
      mockSystemTheme('light');
      window.localStorage.setItem(THEME_STORAGE_KEY, 'sepia');
      const { result } = renderHook(() => useTheme());

      expect(result.current.preference).toBe('dark');
   });

   it('cycles dark → light → system → dark and persists each step', () => {
      mockSystemTheme('dark');
      const { result } = renderHook(() => useTheme());

      act(() => result.current.cycle());
      expect(result.current.preference).toBe('light');
      expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');

      act(() => result.current.cycle());
      expect(result.current.preference).toBe('system');
      expect(result.current.resolved).toBe('dark');
      expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('system');
      expect(document.documentElement).not.toHaveAttribute('data-theme');

      act(() => result.current.cycle());
      expect(result.current.preference).toBe('dark');
      expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
   });

   it('toggle flips what is on screen', () => {
      mockSystemTheme('light');
      const { result } = renderHook(() => useTheme());

      act(() => result.current.toggle());
      expect(result.current.resolved).toBe('light');
      expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
   });
});
