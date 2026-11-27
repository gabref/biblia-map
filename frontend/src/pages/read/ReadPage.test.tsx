import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChapterData } from '../../data/chapterData';
import { __resetStudyStoreForTests, useHistory } from '../../study/store';
import type { VerseRef } from '../../types/generated';

const ref = (id: number, bookNumber: number, chapterNumber: number, verseNumber: number, name: string): VerseRef => ({
   jwpubVerseId: id,
   canonicalVerseId: id,
   bookNumber,
   chapterNumber,
   verseNumber,
   label: `${name} ${chapterNumber}:${verseNumber}`,
});

const john = { bookNumber: 43, name: 'John', shortName: 'John', slug: 'john', testament: 'NT' as const, chapters: 21 };
const romans = { bookNumber: 45, name: 'Romans', shortName: 'Rom.', slug: 'romans', testament: 'NT' as const, chapters: 16 };
const books = Array.from({ length: 66 }, (_, index) => {
   if (index === 42) return john;
   if (index === 44) return romans;
   return { ...john, bookNumber: index + 1, name: `Book ${index + 1}`, slug: `b${index + 1}` };
});
const v16 = ref(1, 43, 3, 16, 'John');
const v17 = ref(2, 43, 3, 17, 'John');
const rom58 = ref(20, 45, 5, 8, 'Romans');

const data: ChapterData = {
   datasetId: 'nwtsty',
   book: john,
   books,
   chapterNumber: 3,
   lang: 'en',
   hasStudyNoteRefs: true,
   verses: [
      { ref: v16, text: 'For God loved the world so much', outgoing: [ { source: 1, targetStart: 20, targetEnd: 20, kind: 0 } ], incoming: [] },
      { ref: v17, text: 'For God sent his Son', outgoing: [], incoming: [] },
   ],
   verseIndex: { 1: v16, 2: v17, 20: rom58 },
   features: { verseDegree: false, chapterMatrix: false, studyNotes: true },
   verseDegree: null,
   studyNotes: new Map([ [ 1, [ 'A note on love.' ] ] ]),
};

vi.mock('../../data/chapterData', async (importOriginal) => {
   const actual = await importOriginal<typeof import('../../data/chapterData')>();

   return {
      ...actual,
      loadChapterData: vi.fn(async () => data),
      loadVerseTexts: vi.fn(async () => new Map([ [ 20, 'God recommends his own love to us' ] ])),
   };
});

const { ReadPage } = await import('./ReadPage');

function HistoryProbe(): React.ReactElement {
   return <output data-testid="history">{useHistory().entries.map((entry) => entry.key).join(',')}</output>;
}

describe('ReadPage', () => {
   beforeEach(() => {
      window.history.replaceState({}, '', '/read/john/3');
      window.scrollTo = vi.fn();
      Element.prototype.scrollIntoView = vi.fn();
   });

   afterEach(() => {
      __resetStudyStoreForTests();
      window.history.replaceState({}, '', '/');
   });

   it('renders the chapter with counts and the chapter summary', async () => {
      render(<ReadPage datasetId="nwtsty" />);

      expect(await screen.findByRole('heading', { level: 1, name: 'John 3' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Verse 16, 1 connections' })).toHaveTextContent('For God loved the world so much');
      expect(screen.getByRole('button', { name: 'Verse 17, 0 connections' })).toBeInTheDocument();
      expect(screen.getByText('2 verses · 1 connections')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Romans: 1 connections. Show its chapters' })).toBeInTheDocument();
   });

   it('opens a verse: connections with VerseLink, study notes, history, hash', async () => {
      render(<><ReadPage datasetId="nwtsty" /><HistoryProbe /></>);
      fireEvent.click(await screen.findByRole('button', { name: 'Verse 16, 1 connections' }));

      const link = await screen.findByRole('link', { name: 'Romans 5:8' });

      expect(link).toHaveAttribute('href', '/verse/romans/5/8');
      expect(screen.getByText('A note on love.')).toBeInTheDocument();
      expect(await screen.findByText('God recommends his own love to us')).toBeInTheDocument();
      expect(screen.getByTestId('history')).toHaveTextContent('43.3.16');
      expect(window.location.hash).toBe('#v16');

      fireEvent.click(screen.getByRole('button', { name: /Study this verse/ }));
      expect(window.location.pathname).toBe('/verse/john/3/16');
   });

   it('navigates chapters with the arrow keys and filters via the URL', async () => {
      render(<ReadPage datasetId="nwtsty" />);
      await screen.findByRole('heading', { level: 1 });

      act(() => {
         fireEvent.click(within(screen.getByRole('tablist', { name: 'Direction' })).getByRole('tab', { name: 'Refers to' }));
      });
      expect(window.location.search).toBe('?dir=outgoing');

      fireEvent.keyDown(document.body, { key: 'ArrowRight' });
      expect(window.location.pathname).toBe('/read/john/4');
      expect(window.location.search).toBe('?dir=outgoing');
   });
});
