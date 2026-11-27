import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';

import { interpolate, t, useLocale, type MessageKey } from './index';

describe('i18n stub', () => {
   it('returns English with interpolation', () => {
      expect(t('shell.nav.home')).toBe('Home');
      expect(t('verse.connections.count', { count: 12 })).toBe('12 connections');
      expect(interpolate('{a} {b}', { a: 1 })).toBe('1 {b}');
   });

   it('falls back to the key for unknown keys', () => {
      expect(t('nope.missing' as MessageKey)).toBe('nope.missing');
   });

   it('useLocale returns en', () => {
      expect(renderHook(() => useLocale()).result.current).toBe('en');
   });
});
