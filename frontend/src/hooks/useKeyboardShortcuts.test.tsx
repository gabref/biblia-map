import { fireEvent, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { onVerseStep } from '../routing/verseStep';
import { __resetStudyStoreForTests, isBookmarked } from '../study/store';
import { useKeyboardShortcuts, type KeyboardShortcutsOptions } from './useKeyboardShortcuts';

const verse = { bookNumber: 43, chapterNumber: 3, verseNumber: 16 };

function setup(overrides: Partial<KeyboardShortcutsOptions> = {}) {
   const options: KeyboardShortcutsOptions = {
      onOpenSearch: vi.fn(),
      onOpenHelp: vi.fn(),
      onBookmarkToggled: vi.fn(),
      verse,
      ...overrides,
   };

   renderHook(() => useKeyboardShortcuts(options));

   return options;
}

const press = (key: string, init: KeyboardEventInit = {}, target: Element = document.body): void => {
   fireEvent.keyDown(target, { key, bubbles: true, ...init });
};

describe('useKeyboardShortcuts', () => {
   beforeEach(() => {
      window.localStorage.clear();
      __resetStudyStoreForTests();
      window.history.replaceState({}, '', '/verse/john/3/16');
   });

   afterEach(() => {
      document.body.innerHTML = '';
      window.history.replaceState({}, '', '/');
   });

   it('opens search with "/" and mod+K, help with "?"', () => {
      const options = setup();

      press('/');
      press('k', { ctrlKey: true });
      press('?', { shiftKey: true });

      expect(options.onOpenSearch).toHaveBeenCalledTimes(2);
      expect(options.onOpenHelp).toHaveBeenCalledTimes(1);
   });

   it('ignores single-key shortcuts while typing, but not mod+K', () => {
      const options = setup();
      const input = document.createElement('input');

      document.body.append(input);
      press('/', {}, input);
      press('b', {}, input);
      press(']', {}, input);
      press('k', { metaKey: true }, input);

      expect(options.onOpenSearch).toHaveBeenCalledTimes(1);
      expect(options.onBookmarkToggled).not.toHaveBeenCalled();
      expect(window.location.pathname).toBe('/verse/john/3/16');
   });

   // The step logic and the study store are code-split, so these shortcuts act asynchronously.
   it('"[" / "]" navigate to the adjacent verse and keep params', async () => {
      setup({ params: { ds: 'nwtsty-i' } });

      press(']');
      await waitFor(() => expect(window.location.pathname + window.location.search).toBe('/verse/john/3/17?ds=nwtsty-i'));
      press('[');
      await waitFor(() => expect(window.location.pathname).toBe('/verse/john/3/15'));
   });

   it('lets the verse page own "[" / "]" via preventDefault', async () => {
      setup();
      const handler = vi.fn((_: number, event: Event) => event.preventDefault());
      const off = onVerseStep(handler);

      press(']');
      await waitFor(() => expect(handler).toHaveBeenCalledWith(1, expect.any(Event)));
      off();

      expect(window.location.pathname).toBe('/verse/john/3/16');
   });

   it('"b" toggles the bookmark of the current verse', async () => {
      const options = setup();

      press('b');
      await waitFor(() => expect(options.onBookmarkToggled).toHaveBeenLastCalledWith(verse, true));
      expect(isBookmarked(verse)).toBe(true);

      press('b');
      await waitFor(() => expect(options.onBookmarkToggled).toHaveBeenLastCalledWith(verse, false));
      expect(isBookmarked(verse)).toBe(false);
   });

   it('verse shortcuts are off outside verse routes, everything is off when disabled', async () => {
      const offRoute = setup({ verse: null });

      press('b');
      press(']');
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(offRoute.onBookmarkToggled).not.toHaveBeenCalled();
      expect(window.location.pathname).toBe('/verse/john/3/16');

      const disabled = setup({ enabled: false });

      press('/');
      expect(disabled.onOpenSearch).not.toHaveBeenCalled();
   });
});
