import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
   clearGeneratedDataCache,
   findSearchBook,
   hasDatasetFeature,
   loadCompareBook,
   loadCompareIndex,
   loadSearchIndex,
   loadStudyNotes,
   normalizeSearchKey,
   searchIndexVerseId,
} from './generated';
import type { SearchIndex } from '../types/generated';

function jsonResponse(body: unknown, status = 200): Response {
   return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const searchIndex: SearchIndex = {
   schemaVersion: 1,
   language: 'Italian',
   books: [
      {
         bookNumber: 43,
         slug: 'john',
         name: 'Giovanni',
         shortName: 'Giovanni',
         testament: 'NT',
         aliases: ['Gv', 'John', 'Jn'],
         keys: ['giovanni', 'gv', 'john', 'jn'],
         chapters: [
            [26000, 1, 51],
            [26051, 12, 48],
         ],
      },
      {
         bookNumber: 6,
         slug: 'joshua',
         name: 'Giosuè',
         shortName: 'Giosuè',
         testament: 'OT',
         aliases: [],
         keys: ['giosue'],
         chapters: [[5000, 1, 18]],
      },
   ],
   irregularVerses: [[99999, 6, 1, 30]],
};

describe('search index helpers', () => {
   it('normalizes keys like the extractor', () => {
      expect(normalizeSearchKey('1 Cor.')).toBe('1cor');
      expect(normalizeSearchKey('Giosuè')).toBe('giosue');
      expect(normalizeSearchKey('  JN ')).toBe('jn');
   });

   it('finds books by localized name, alias or English abbreviation', () => {
      expect(findSearchBook(searchIndex, 'gv')?.bookNumber).toBe(43);
      expect(findSearchBook(searchIndex, 'Jn')?.bookNumber).toBe(43);
      expect(findSearchBook(searchIndex, 'GIOSUE')?.bookNumber).toBe(6);
      expect(findSearchBook(searchIndex, '')).toBeUndefined();
      expect(findSearchBook(searchIndex, 'xyz')).toBeUndefined();
   });

   it('resolves verse ids from chapter runs, including runs that start after verse 1', () => {
      expect(searchIndexVerseId(searchIndex, 43, 1, 1)).toBe(26000);
      expect(searchIndexVerseId(searchIndex, 43, 2, 12)).toBe(26051);
      expect(searchIndexVerseId(searchIndex, 43, 2, 13)).toBe(26052);
      expect(searchIndexVerseId(searchIndex, 43, 2, 11)).toBeNull();
      expect(searchIndexVerseId(searchIndex, 43, 3, 1)).toBeNull();
      expect(searchIndexVerseId(searchIndex, 6, 1, 30)).toBe(99999);
   });

   it('reads manifest features defensively', () => {
      expect(hasDatasetFeature({ features: ['search-index'] }, 'search-index')).toBe(true);
      expect(hasDatasetFeature({}, 'search-index')).toBe(false);
   });
});

describe('optional file loaders', () => {
   const fetchMock = vi.fn<typeof fetch>();

   beforeEach(() => {
      clearGeneratedDataCache();
      fetchMock.mockReset();
      vi.stubGlobal('fetch', fetchMock);
   });

   afterEach(() => {
      vi.unstubAllGlobals();
   });

   it('returns null without fetching the file when the manifest lacks the feature', async () => {
      fetchMock.mockImplementation(async () => jsonResponse({ datasetId: 'nwt' }));

      await expect(loadSearchIndex('nwt')).resolves.toBeNull();
      await expect(loadStudyNotes('nwt', 40)).resolves.toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith('/generated/nwt/manifest.json');
   });

   it('loads per-book study notes through the book slug', async () => {
      fetchMock.mockImplementation(async (input) => {
         const url = String(input);

         if (url.endsWith('manifest.json')) {
            return jsonResponse({ datasetId: 'nwtsty', features: ['study-note-text'] });
         }
         if (url.endsWith('books.json')) {
            return jsonResponse([{ bookNumber: 40, slug: 'matthew' }]);
         }

         return jsonResponse({ '23261': [{ commentaryId: 1, heading: '1:1', paragraphs: [] }] });
      });

      const notes = await loadStudyNotes('nwtsty', 40);

      expect(notes?.['23261']?.[0]?.commentaryId).toBe(1);
      expect(fetchMock).toHaveBeenCalledWith('/generated/nwtsty/study-notes/40.matthew.json');
   });

   it('treats a missing compare index as no comparisons', async () => {
      fetchMock.mockResolvedValue(jsonResponse({}, 404));

      await expect(loadCompareIndex()).resolves.toBeNull();
      await expect(loadCompareBook('nwt__rbi8', { bookNumber: 45, slug: 'romans' })).resolves.toBeNull();
   });

   it('loads a compare book for a listed pair', async () => {
      fetchMock.mockImplementation(async (input) =>
         String(input).endsWith('index.json')
            ? jsonResponse({ schemaVersion: 1, pairs: [{ id: 'nwt__rbi8', a: 'nwt', b: 'rbi8' }] })
            : jsonResponse({ '45012012': [3, [], [52005017]] }),
      );

      const book = await loadCompareBook('nwt__rbi8', { bookNumber: 45, slug: 'romans' });

      expect(book?.['45012012']).toEqual([3, [], [52005017]]);
      expect(fetchMock).toHaveBeenCalledWith('/generated/compare/nwt__rbi8/45.romans.json');
   });
});
