import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

import { __resetStudyStoreForTests, createCollection, getCollectionNote, getNote, isBookmarked, setNote } from '../study/store';
import { NOTE_AUTOSAVE_MS, NoteEditor } from './NoteEditor';
import { SaveVerseButton } from './SaveVerseButton';

beforeEach(() => {
   window.localStorage.clear();
   __resetStudyStoreForTests();
});

afterEach(() => {
   vi.useRealTimers();
});

describe('NoteEditor', () => {
   it('autosaves after 500 ms of inactivity and shows a count and the privacy hint', () => {
      vi.useFakeTimers();
      render(<NoteEditor verse="43.3.16" />);
      const box = screen.getByLabelText('My note');

      fireEvent.change(box, { target: { value: 'Love' } });
      expect(screen.getByText('Saving…')).toBeInTheDocument();
      act(() => vi.advanceTimersByTime(NOTE_AUTOSAVE_MS - 1));
      expect(getNote('43.3.16')).toBe('');
      act(() => vi.advanceTimersByTime(1));
      expect(getNote('43.3.16')).toBe('Love');
      expect(screen.getByText('Saved')).toBeInTheDocument();
      expect(screen.getByText('4 / 10,000')).toBeInTheDocument();
      expect(screen.getByText(/Notes stay on this device/)).toBeInTheDocument();
   });

   it('saves immediately on blur and on unmount', () => {
      const { unmount } = render(<NoteEditor collectionId="saved" />);
      const box = screen.getByLabelText('Collection notes');

      fireEvent.change(box, { target: { value: 'Outline' } });
      fireEvent.blur(box);
      expect(getCollectionNote('saved')).toBe('Outline');

      fireEvent.change(box, { target: { value: 'Outline 2' } });
      unmount();
      expect(getCollectionNote('saved')).toBe('Outline 2');
   });

   it('adopts external changes while not typing', () => {
      render(<NoteEditor verse="43.3.16" />);

      act(() => setNote('43.3.16', 'from another tab'));
      expect(screen.getByLabelText('My note')).toHaveValue('from another tab');
   });
});

describe('SaveVerseButton', () => {
   it('quick-saves to Saved and opens an accessible picker', () => {
      render(<SaveVerseButton verse={{ bookNumber: 43, chapterNumber: 3, verseNumber: 16 }} label="John 3:16" />);
      const trigger = screen.getByRole('button', { name: 'Save' });

      fireEvent.click(trigger);
      expect(isBookmarked('43.3.16', 'saved')).toBe(true);
      expect(trigger).toHaveAttribute('aria-expanded', 'true');

      const dialog = screen.getByRole('dialog', { name: 'Save John 3:16 to…' });
      const savedBox = screen.getByRole('checkbox', { name: /Saved/ });
      expect(dialog).toBeInTheDocument();
      expect(savedBox).toBeChecked();
      expect(savedBox).toHaveFocus();

      fireEvent.keyDown(dialog, { key: 'Escape' });
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.getByRole('button', { name: 'Saved' })).toHaveFocus();
   });

   it('toggles collections and creates one inline', () => {
      const talk = createCollection('Talk')!;

      render(<SaveVerseButton verse="45.5.8" label="Romans 5:8" appearance="icon" quickSave={false} />);
      fireEvent.click(screen.getByRole('button', { name: 'Save Romans 5:8' }));
      expect(isBookmarked('45.5.8')).toBe(false);

      fireEvent.click(screen.getByRole('checkbox', { name: /Talk/ }));
      expect(isBookmarked('45.5.8', talk.id)).toBe(true);

      fireEvent.change(screen.getByLabelText('New collection name'), { target: { value: 'Faith' } });
      fireEvent.click(screen.getByRole('button', { name: 'Create' }));
      expect(screen.getByRole('checkbox', { name: /Faith/ })).toBeChecked();

      fireEvent.click(screen.getByRole('checkbox', { name: /Talk/ }));
      expect(isBookmarked('45.5.8', talk.id)).toBe(false);
      expect(screen.getByRole('button', { name: /Romans 5:8 is saved/ })).toBeInTheDocument();
   });
});
