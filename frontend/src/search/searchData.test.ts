/**
 * loadSearchData against the real generated files (E-G `search-index.json`), served by a fetch mock.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearGeneratedDataCache } from '../data/generated';
import { searchCitations } from './search';
import { clearSearchDataCache, loadSearchData, verseCountOf } from './searchData';

const files = import.meta.glob<string>('../../public/generated/*/{manifest,books,search-index}.json', { eager: true, query: '?raw', import: 'default' });

describe('loadSearchData with search-index.json', () => {
   const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input).split('?')[0];

      const body = files[`../../public${path}`];

      return body === undefined ? new Response('not found', { status: 404 }) : new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } });
   });

   beforeEach(() => {
      clearGeneratedDataCache();
      clearSearchDataCache();
      fetchMock.mockClear();
      vi.stubGlobal('fetch', fetchMock);
   });

   afterEach(() => vi.unstubAllGlobals());

   it('uses the Italian index: names, verse counts and aliases', async () => {
      const data = await loadSearchData('nwtsty-i');

      expect(data.source).toBe('search-index');
      expect(data.language).toBe('it');
      expect(fetchMock.mock.calls.some(([ url ]) => String(url).endsWith('/nwtsty-i/search-index.json'))).toBe(true);
      expect(fetchMock.mock.calls.some(([ url ]) => String(url).endsWith('/nwtsty-i/books.json'))).toBe(false);

      const john = data.books.find((book) => book.bookNumber === 43);

      expect(john?.name).toBe('Giovanni');
      expect(john && verseCountOf(john, 3)).toBe(36);

      expect(searchCitations('Gv 3:16', data)[0]).toMatchObject({ kind: 'verse', bookNumber: 43, chapter: 3, verse: 16, label: 'Giovanni 3:16' });
      expect(searchCitations('Sal 23', data)[0]).toMatchObject({ kind: 'chapter', bookNumber: 19, chapter: 23 });
      expect(searchCitations('John 3:16', data)[0]).toMatchObject({ bookNumber: 43, chapter: 3, verse: 16 });
      // Real verse counts: John 3 has 36 verses, so 3:37 is not a verse.
      expect(searchCitations('Gv 3:37', data).some((result) => result.kind === 'verse' && result.verse === 37)).toBe(false);
   });

   it.each([ 'nwtsty', 'nwt', 'rbi8' ])('loads the %s index', async (datasetId) => {
      const data = await loadSearchData(datasetId);

      expect(data.source).toBe('search-index');
      expect(data.books).toHaveLength(66);
      expect(searchCitations('Ps 23', data)[0]).toMatchObject({ kind: 'chapter', bookNumber: 19, chapter: 23 });
   });
});
