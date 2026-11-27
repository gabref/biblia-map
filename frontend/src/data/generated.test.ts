import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
   bookFileName,
   clearGeneratedDataCache,
   edgeKindCode,
   isValidDatasetId,
   loadBooks,
   loadDatasets,
   loadManifest,
   loadSourceAdjacency,
} from './generated';

function jsonResponse(body: unknown, status = 200): Response {
   return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('generated data helpers', () => {
   it('builds stable per-book adjacency filenames', () => {
      expect(bookFileName({ bookNumber: 45, slug: 'romans' })).toBe('45.romans.json');
   });

   it('maps edge filters to compact edge kind codes', () => {
      expect(edgeKindCode('combined')).toBeNull();
      expect(edgeKindCode('crossrefs')).toBe(0);
      expect(edgeKindCode('study-notes')).toBe(1);
   });

   it('accepts registry dataset ids and rejects path-like ids', () => {
      expect(isValidDatasetId('nwtsty-i')).toBe(true);
      expect(isValidDatasetId('rbi8')).toBe(true);
      expect(isValidDatasetId('../secret')).toBe(false);
      expect(isValidDatasetId('a/b')).toBe(false);
      expect(isValidDatasetId('')).toBe(false);
   });
});

describe('generated data loading', () => {
   const fetchMock = vi.fn<typeof fetch>();

   beforeEach(() => {
      clearGeneratedDataCache();
      fetchMock.mockReset();
      vi.stubGlobal('fetch', fetchMock);
   });

   afterEach(() => {
      vi.unstubAllGlobals();
   });

   it('fetches each file once and shares concurrent and later requests', async () => {
      fetchMock.mockImplementation(async () => jsonResponse([ { bookNumber: 1 } ]));

      const [ first, second ] = await Promise.all([ loadBooks('nwt'), loadBooks('nwt') ]);
      const third = await loadBooks('nwt');

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith('/generated/nwt/books.json');
      expect(second).toBe(first);
      expect(third).toBe(first);
   });

   it('keys the cache by dataset', async () => {
      fetchMock.mockImplementation(async (input) => jsonResponse({ url: String(input) }));

      await loadManifest('nwt');
      await loadManifest('rbi8');

      expect(fetchMock).toHaveBeenCalledTimes(2);
   });

   it('does not cache failures, so a retry refetches', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({}, 503)).mockResolvedValueOnce(jsonResponse([]));

      await expect(loadDatasets()).rejects.toThrow('datasets.json (HTTP 503)');
      await expect(loadDatasets()).resolves.toEqual([]);
      expect(fetchMock).toHaveBeenCalledTimes(2);
   });

   it('reports an HTML fallback page as invalid JSON instead of a parser error', async () => {
      fetchMock.mockResolvedValue(
         new Response('<!doctype html><html></html>', { status: 200, headers: { 'content-type': 'text/html' } }),
      );

      await expect(loadManifest('nwt')).rejects.toThrow('not valid JSON: nwt/manifest.json (text/html)');
   });

   it('refuses path-like dataset ids without fetching', async () => {
      await expect(loadManifest('../etc')).rejects.toThrow('Invalid dataset id');
      expect(fetchMock).not.toHaveBeenCalled();
   });

   it('evicts the least recently used file once the cache is full', async () => {
      fetchMock.mockImplementation(async () => jsonResponse({}));
      const book = (bookNumber: number) => ({ bookNumber, slug: `b${bookNumber}`, name: '', shortName: '', testament: 'OT' as const, chapters: 1 });

      await loadSourceAdjacency('nwt', book(1));
      for (let bookNumber = 2; bookNumber <= 64; bookNumber += 1) {
         await loadSourceAdjacency('nwt', book(bookNumber));
      }
      // Touch book 1 so book 2 becomes the oldest entry, then overflow by one.
      await loadSourceAdjacency('nwt', book(1));
      await loadSourceAdjacency('nwt', book(65));
      fetchMock.mockClear();

      await loadSourceAdjacency('nwt', book(1));
      expect(fetchMock).not.toHaveBeenCalled();
      await loadSourceAdjacency('nwt', book(2));
      expect(fetchMock).toHaveBeenCalledTimes(1);
   });
});
