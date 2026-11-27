import { describe, expect, it } from 'vitest';

import {
   abbreviateBookNames,
   buildEgoGraph,
   buildFirstHop,
   formatPassageLabel,
   groupByBook,
   MAX_ADJACENCY_FILES,
   passageKey,
   passageVerseIds,
   planAdjacencyFiles,
   rankSecondHop,
   SECOND_HOP_PAGE,
   type AdjacencyLookup,
   type NeighborNode,
} from '../graph/neighborhood';
import { parseLocation } from '../routing/routes';
import type { AdjacentEdge, EdgeKindCode, StudyNotesBook, VerseRef } from '../types/generated';
import { buildVerseCatalog } from './verse/catalog';
import { computeLayout, fitTransform, linkPath, nearestInDirection, spreadWithGap } from './verse/layout';
import { findStudyNote, studyNoteExcerpt } from './verse/studyNotes';
import { lastTrailVerse, pushTrail } from './verse/trail';
import { activeFilterCount, DEFAULT_FILTERS, filtersFromParams, paramsForFilters, verseStudyHref } from './verse/urlState';

function edge(source: number, targetStart: number, targetEnd: number = targetStart, kind: EdgeKindCode = 0, commentaryId: number | null = null): AdjacentEdge {
   return { source, targetStart, targetEnd, kind, commentaryId };
}

function ref(id: number, bookNumber: number, chapterNumber: number, verseNumber: number, book: string): VerseRef {
   return {
      jwpubVerseId: id,
      canonicalVerseId: bookNumber * 1_000_000 + chapterNumber * 1000 + verseNumber,
      bookNumber,
      chapterNumber,
      verseNumber,
      label: `${book} ${chapterNumber}:${verseNumber}`,
   };
}

function lookupFrom(outgoing: Record<number, AdjacentEdge[]>, incoming: Record<number, AdjacentEdge[]> = {}): AdjacencyLookup {
   return { outgoing: (id) => outgoing[id], incoming: (id) => incoming[id] };
}

describe('buildFirstHop', () => {
   it('keeps a range reference as one passage with its end verse', () => {
      const nodes = buildFirstHop({
         centerId: 10,
         outgoing: [ edge(10, 100, 134), edge(10, 100) ],
         incoming: [],
         direction: 'all',
         edgeKind: 'combined',
      });

      expect(nodes.map((node) => [ node.key, node.verseId, node.endVerseId ])).toEqual([
         [ '100-100', 100, 100 ],
         [ '100-134', 100, 134 ],
      ]);
   });

   it('merges both directions into one node and counts every edge', () => {
      const [ node ] = buildFirstHop({
         centerId: 10,
         outgoing: [ edge(10, 20), edge(10, 20, 20, 1, 0) ],
         incoming: [ edge(20, 10) ],
         direction: 'all',
         edgeKind: 'combined',
      });

      expect(node.direction).toBe('both');
      expect(node.edges).toHaveLength(3);
      expect(node.crossRefCount).toBe(2);
      expect(node.studyNoteCount).toBe(1);
      // commentaryId 0 is a real id and must survive (the old page dropped it with a truthy check).
      expect(node.edges.some((item) => item.edge.commentaryId === 0)).toBe(true);
   });

   it('applies the direction and reference-type filters', () => {
      const input = {
         centerId: 10,
         outgoing: [ edge(10, 20), edge(10, 30, 30, 1) ],
         incoming: [ edge(40, 10) ],
      };

      expect(buildFirstHop({ ...input, direction: 'outgoing', edgeKind: 'combined' }).map((node) => node.verseId)).toEqual([ 20, 30 ]);
      expect(buildFirstHop({ ...input, direction: 'incoming', edgeKind: 'combined' }).map((node) => node.verseId)).toEqual([ 40 ]);
      expect(buildFirstHop({ ...input, direction: 'all', edgeKind: 'study-notes' }).map((node) => node.verseId)).toEqual([ 30 ]);
      expect(buildFirstHop({ ...input, direction: 'all', edgeKind: 'crossrefs' }).map((node) => node.verseId)).toEqual([ 20, 40 ]);
   });

   it('ignores a verse citing itself and treats reversed ranges as one verse', () => {
      const nodes = buildFirstHop({
         centerId: 10,
         outgoing: [ edge(10, 10), edge(10, 50, 40) ],
         incoming: [ edge(10, 10) ],
         direction: 'all',
         edgeKind: 'combined',
      });

      expect(nodes.map((node) => node.key)).toEqual([ '50-50' ]);
   });
});

describe('rankSecondHop', () => {
   const firstHop = buildFirstHop({
      centerId: 1,
      outgoing: [ edge(1, 10), edge(1, 20), edge(1, 30) ],
      incoming: [],
      direction: 'all',
      edgeKind: 'combined',
   });

   it('ranks by the number of first-hop verses sharing a link, then by links, then canonical order', () => {
      const ranked = rankSecondHop({
         centerId: 1,
         firstHop,
         direction: 'all',
         edgeKind: 'combined',
         lookup: lookupFrom(
            { 10: [ edge(10, 500), edge(10, 600), edge(10, 700) ], 20: [ edge(20, 500), edge(20, 600), edge(20, 600) ], 30: [ edge(30, 500) ] },
            { 10: [], 20: [], 30: [ edge(650, 30) ] },
         ),
      });

      expect(ranked.map((node) => [ node.verseId, node.score ])).toEqual([
         [ 500, 3 ],
         [ 600, 2 ],
         [ 650, 1 ],
         [ 700, 1 ],
      ]);
      expect(ranked[0].via.map((via) => via.from).sort()).toEqual([ '10-10', '20-20', '30-30' ]);
      expect(ranked.every((node) => node.depth === 2)).toBe(true);
   });

   it('never returns the centre or a first-hop passage, and tolerates books that are not loaded', () => {
      const ranked = rankSecondHop({
         centerId: 1,
         firstHop,
         direction: 'all',
         edgeKind: 'combined',
         // Verse 20 and 30 belong to adjacency files that have not been fetched.
         lookup: lookupFrom({ 10: [ edge(10, 1), edge(10, 20), edge(10, 0, 5), edge(10, 900) ] }),
      });

      expect(ranked.map((node) => node.verseId)).toEqual([ 900 ]);
   });

   it('follows only the requested direction and reference type', () => {
      const lookup = lookupFrom({ 10: [ edge(10, 500), edge(10, 510, 510, 1) ] }, { 10: [ edge(700, 10) ], 20: [], 30: [] });

      expect(rankSecondHop({ centerId: 1, firstHop, lookup, direction: 'outgoing', edgeKind: 'crossrefs' }).map((node) => node.verseId)).toEqual([ 500 ]);
      expect(rankSecondHop({ centerId: 1, firstHop, lookup, direction: 'incoming', edgeKind: 'combined' }).map((node) => node.verseId)).toEqual([ 700 ]);
   });
});

describe('buildEgoGraph', () => {
   const firstHop = buildFirstHop({
      centerId: 1,
      outgoing: Array.from({ length: 6 }, (_, index) => edge(1, 10 + index)),
      incoming: [],
      direction: 'all',
      edgeKind: 'combined',
   });
   const secondHop = rankSecondHop({
      centerId: 1,
      firstHop,
      direction: 'all',
      edgeKind: 'combined',
      lookup: lookupFrom(Object.fromEntries(firstHop.map((node) => [ node.verseId, Array.from({ length: 30 }, (_, index) => edge(node.verseId, 1000 + index)) ]))),
   });

   it('enforces the second-hop cap: drawn nodes never exceed first hop + limit', () => {
      const graph = buildEgoGraph({ centerId: 1, firstHop, secondHop });

      expect(secondHop).toHaveLength(30);
      expect(graph.nodes).toHaveLength(6 + 30);

      const capped = buildEgoGraph({ centerId: 1, firstHop, secondHop, secondHopLimit: 7 });

      expect(capped.nodes).toHaveLength(6 + 7);
      expect(capped.secondHopShown).toBe(7);
      expect(capped.secondHopTotal).toBe(30);
      expect(SECOND_HOP_PAGE).toBe(40);
   });

   it('enforces the first-hop cap and only links nodes that are drawn', () => {
      const graph = buildEgoGraph({ centerId: 1, firstHop, secondHop, secondHopLimit: 5, maxFirstHop: 2 });
      const keys = new Set([ graph.centerKey, ...graph.nodes.map((node) => node.key) ]);

      expect(graph.firstHopShown).toBe(2);
      expect(graph.firstHopTotal).toBe(6);
      expect(graph.nodes.filter((node) => node.depth === 1)).toHaveLength(2);
      expect(graph.links.every((link) => keys.has(link.a) && keys.has(link.b))).toBe(true);
      expect(graph.links.filter((link) => link.depth === 2)).toHaveLength(5 * 2);
   });

   it('draws nothing beyond the first hop at depth 1', () => {
      const graph = buildEgoGraph({ centerId: 1, firstHop });

      expect(graph.nodes).toHaveLength(6);
      expect(graph.links).toHaveLength(6);
      expect(graph.centerKey).toBe(passageKey(1));
   });
});

describe('planAdjacencyFiles', () => {
   const nodesIn = (books: number[]): NeighborNode[] =>
      buildFirstHop({
         centerId: 1,
         outgoing: books.map((book, index) => edge(1, book * 1000 + index)),
         incoming: [],
         direction: 'all',
         edgeKind: 'combined',
      });
   const bookOf = (verseId: number): number | null => (verseId >= 99_000 ? null : Math.floor(verseId / 1000));

   it('never plans more than the file budget and prefers the books with most first-hop verses', () => {
      const books = Array.from({ length: 30 }, (_, index) => index + 2);
      const firstHop = nodesIn([ ...books, 7, 7, 7, 9, 9 ]);
      const plan = planAdjacencyFiles({ firstHop, bookOf, direction: 'all', maxFiles: MAX_ADJACENCY_FILES - 2 });

      expect(plan.files.length).toBeLessThanOrEqual(23);
      expect(plan.files.slice(0, 4)).toEqual([
         { mode: 'source', bookNumber: 7 },
         { mode: 'target', bookNumber: 7 },
         { mode: 'source', bookNumber: 9 },
         { mode: 'target', bookNumber: 9 },
      ]);
      expect(plan.deferred.length).toBe(30 * 2 - plan.files.length);
      expect(plan.totalNodes).toBe(35);
      expect(plan.coveredNodes).toBe(4 + 3 + 9);
   });

   it('loads one file per book when only one direction is shown', () => {
      const plan = planAdjacencyFiles({ firstHop: nodesIn([ 2, 3 ]), bookOf, direction: 'incoming', maxFiles: 10 });

      expect(plan.files).toEqual([
         { mode: 'target', bookNumber: 2 },
         { mode: 'target', bookNumber: 3 },
      ]);
   });

   it('does not spend budget on files already in memory and skips unknown verses', () => {
      const plan = planAdjacencyFiles({
         firstHop: nodesIn([ 2, 3, 99 ]),
         bookOf,
         direction: 'all',
         loaded: new Set([ 'source:2', 'target:2' ]),
         maxFiles: 2,
      });

      expect(plan.files).toEqual([
         { mode: 'source', bookNumber: 3 },
         { mode: 'target', bookNumber: 3 },
      ]);
      expect(plan.totalNodes).toBe(2);
      expect(plan.coveredNodes).toBe(2);
   });
});

describe('passage labels and ranges', () => {
   const refs = new Map<number, VerseRef>([
      [ 1, ref(1, 19, 104, 1, 'Psalm') ],
      [ 35, ref(35, 19, 104, 35, 'Psalm') ],
      [ 40, ref(40, 19, 105, 3, 'Psalm') ],
      [ 90, ref(90, 62, 4, 9, '1 John') ],
   ]);
   const lookup = (id: number): VerseRef | undefined => refs.get(id);

   it('shows the whole range, not just the first verse', () => {
      expect(formatPassageLabel(1, 1, lookup)).toBe('Psalm 104:1');
      expect(formatPassageLabel(1, 35, lookup)).toBe('Psalm 104:1-35');
      expect(formatPassageLabel(1, 40, lookup)).toBe('Psalm 104:1–105:3');
      expect(formatPassageLabel(40, 90, lookup)).toBe('Psalm 105:3 – 1 John 4:9');
   });

   it('falls back gracefully for unknown verses and supports short book names', () => {
      expect(formatPassageLabel(7, 7, lookup)).toBe('Verse 7');
      expect(formatPassageLabel(1, 999, lookup)).toBe('Psalm 104:1');
      expect(formatPassageLabel(90, 90, lookup, { bookName: () => '1 Joh.' })).toBe('1 Joh. 4:9');
      expect(formatPassageLabel(1, 35, lookup, { bookName: () => 'Ps.' })).toBe('Ps. 104:1-35');
   });

   it('expands a range to the verses that exist, with a cap', () => {
      const has = (id: number): boolean => id !== 3;

      expect(passageVerseIds(1, 5, has)).toEqual([ 1, 2, 4, 5 ]);
      expect(passageVerseIds(5, 1, has)).toEqual([ 5 ]);
      expect(passageVerseIds(1, 10_000, has, 4)).toEqual([ 1, 2, 4 ]);
   });

   it('groups nodes by book in canonical order and drops unknown verses', () => {
      const groups = groupByBook(
         [ { verseId: 90 }, { verseId: 1 }, { verseId: 35 }, { verseId: 7 } ],
         (id) => refs.get(id)?.bookNumber ?? null,
      );

      expect(groups.map((group) => [ group.bookNumber, group.nodes.length ])).toEqual([
         [ 19, 2 ],
         [ 62, 1 ],
      ]);
   });

   it('abbreviates book names uniquely in any language', () => {
      const names = [ 'Genesis', 'Judges', 'Jude', 'John', '1 John', '1 Corinthians', 'Philippians', 'Philemon', 'Song of Solomon', 'Giovanni', 'Giosuè' ];
      const short = abbreviateBookNames(names.map((name, index) => ({ bookNumber: index + 1, name })));

      expect(short.get(1)).toBe('Gen.');
      expect(short.get(4)).toBe('John');
      expect(short.get(5)).toBe('1 John');
      expect(short.get(6)).toBe('1 Cor.');
      expect(short.get(9)).toBe('Song');
      expect(new Set(short.values()).size).toBe(names.length);
   });
});

describe('verse catalog', () => {
   const catalog = buildVerseCatalog({
      '5': ref(5, 43, 3, 16, 'John'),
      '6': ref(6, 43, 3, 17, 'John'),
      '9': ref(9, 62, 1, 1, '1 John'),
   });

   it('resolves verses without assuming dense ids, and never falls back to Genesis', () => {
      expect(catalog.find(43, 3, 16)?.jwpubVerseId).toBe(5);
      expect(catalog.find(43, 3, 99)).toBeUndefined();
      expect(catalog.bookOf(7)).toBeNull();
      expect(catalog.chapters(62)).toEqual([ 1 ]);
      expect(catalog.verses(43, 3).map((verse) => verse.verseNumber)).toEqual([ 16, 17 ]);
   });

   it('steps across chapter and book boundaries in canonical order', () => {
      expect(catalog.step(6, 1)?.label).toBe('1 John 1:1');
      expect(catalog.step(5, -1)).toBeUndefined();
      expect(catalog.step(9, 1)).toBeUndefined();
   });
});

describe('URL state', () => {
   it('reads filters from route params with defaults', () => {
      expect(filtersFromParams({})).toEqual(DEFAULT_FILTERS);
      expect(filtersFromParams({ kind: 'study-notes', dir: 'incoming', depth: 2 })).toEqual({ kind: 'study-notes', dir: 'incoming', depth: 2 });
   });

   it('no longer accepts depth 3', () => {
      const { params } = parseLocation(new URL('https://bibliamap.test/verse/john/3/16?depth=3&kind=crossrefs'));

      expect(filtersFromParams(params)).toEqual({ kind: 'crossrefs', dir: 'all', depth: 1 });
   });

   it('writes only non-default filters and keeps the dataset and language', () => {
      expect(paramsForFilters(DEFAULT_FILTERS, { ds: 'nwtsty', lang: 'it', kind: 'crossrefs' })).toEqual({ ds: 'nwtsty', lang: 'it' });
      expect(verseStudyHref({ bookNumber: 43, chapterNumber: 3, verseNumber: 16 }, DEFAULT_FILTERS)).toBe('/verse/john/3/16');
      expect(
         verseStudyHref({ bookNumber: 62, chapterNumber: 4, verseNumber: 9 }, { kind: 'crossrefs', dir: 'outgoing', depth: 2 }, { ds: 'nwt' }),
      ).toBe('/verse/1-john/4/9?ds=nwt&kind=crossrefs&dir=outgoing&depth=2');
   });

   it('round-trips through the router', () => {
      const href = verseStudyHref({ bookNumber: 19, chapterNumber: 104, verseNumber: 1 }, { kind: 'study-notes', dir: 'incoming', depth: 2 });
      const parsed = parseLocation(new URL(href, 'https://bibliamap.test'));

      expect(parsed.route).toEqual({ name: 'verse', book: 19, chapter: 104, verse: 1 });
      expect(filtersFromParams(parsed.params)).toEqual({ kind: 'study-notes', dir: 'incoming', depth: 2 });
   });

   it('counts active filters', () => {
      expect(activeFilterCount(DEFAULT_FILTERS)).toBe(0);
      expect(activeFilterCount({ kind: 'crossrefs', dir: 'all', depth: 2 })).toBe(2);
   });
});

describe('study trail', () => {
   it('appends new verses, keeps revisited ones in place and caps at eight', () => {
      expect(pushTrail([ '43.3.16' ], '62.4.9')).toEqual([ '43.3.16', '62.4.9' ]);
      expect(pushTrail([ '43.3.16', '62.4.9' ], '43.3.16')).toEqual([ '43.3.16', '62.4.9' ]);

      const long = Array.from({ length: 8 }, (_, index) => `1.1.${index + 1}` as const);

      expect(pushTrail(long, '2.1.1')).toEqual([ ...long.slice(1), '2.1.1' ]);
      expect(lastTrailVerse([ '43.3.16', '62.4.9' ])).toEqual({ bookNumber: 62, chapterNumber: 4, verseNumber: 9 });
      expect(lastTrailVerse([])).toBeNull();
   });
});

describe('study-note text (E-G study-notes files)', () => {
   const sentence = 'God loved the world of mankind in need of redemption. (Joh 1:29) The noun is used at 1Jo 4:8, where John says “God is love.” More follows here.';
   const first = sentence.indexOf('Joh 1:29');
   const second = sentence.indexOf('1Jo 4:8');
   const book: StudyNotesBook = {
      '5': [
         {
            commentaryId: 0,
            heading: '3:16',
            paragraphs: [
               { pid: 20, text: 'An opening paragraph.' },
               { pid: 21, lemma: 'loved', text: sentence, refs: [ [ first, first + 8, 100, 100 ], [ second, second + 7, 200, 201 ] ] },
            ],
         },
         { commentaryId: 9, heading: '3:16', paragraphs: [ { text: 'Another note. '.repeat(60) } ] },
      ],
   };
   const edge = { kind: 1, source: 5, targetStart: 200, targetEnd: 201, commentaryId: 0, paragraphOrdinal: 21 } as const;

   it('matches a note by commentary id (0 is a valid id) and finds the citing paragraph', () => {
      expect(findStudyNote(book, edge)?.paragraph.pid).toBe(21);
      expect(findStudyNote(book, { ...edge, commentaryId: 9 })?.note.commentaryId).toBe(9);
      expect(findStudyNote(book, { ...edge, commentaryId: 4 })).toBeNull();
      // Without a commentary id a verse with several notes is ambiguous.
      expect(findStudyNote(book, { ...edge, commentaryId: null })).toBeNull();
   });

   it('excerpts the sentences around the citation and marks it', () => {
      const excerpt = studyNoteExcerpt(book, edge);

      expect(excerpt?.lemma).toBe('loved');
      expect(excerpt?.clippedStart).toBe(false);
      expect(excerpt?.segments.map((segment) => segment.text).join('')).toContain('The noun is used at 1Jo 4:8');
      expect(excerpt?.segments.filter((segment) => segment.ref).map((segment) => [ segment.text, segment.ref?.cited ])).toEqual([
         [ 'Joh 1:29', false ],
         [ '1Jo 4:8', true ],
      ]);
   });

   it('clips long paragraphs at word or sentence boundaries', () => {
      const excerpt = studyNoteExcerpt(book, { ...edge, commentaryId: 9, paragraphOrdinal: null }, 100);
      const text = excerpt?.segments.map((segment) => segment.text).join('') ?? '';

      expect(excerpt?.clippedEnd).toBe(true);
      expect(text.length).toBeLessThanOrEqual(150);
      expect(text.endsWith('note.')).toBe(true);
   });

   it('yields nothing for cross references, unknown verses and missing files', () => {
      expect(studyNoteExcerpt(book, { ...edge, kind: 0 })).toBeNull();
      expect(studyNoteExcerpt(book, { ...edge, source: 6 })).toBeNull();
      expect(studyNoteExcerpt(null, edge)).toBeNull();
      expect(studyNoteExcerpt(undefined, edge)).toBeNull();
   });
});

describe('graph layout', () => {
   const firstHop = buildFirstHop({
      centerId: 1,
      outgoing: [ edge(1, 10), edge(1, 11), edge(1, 12, 14), edge(1, 30) ],
      incoming: [ edge(20, 1), edge(21, 1), edge(30, 1) ],
      direction: 'all',
      edgeKind: 'combined',
   });
   const secondHop = rankSecondHop({
      centerId: 1,
      firstHop,
      direction: 'all',
      edgeKind: 'combined',
      lookup: lookupFrom({ 10: [ edge(10, 500) ], 11: [ edge(11, 500) ], 20: [ edge(20, 600) ] }, {}),
   });
   const graph = buildEgoGraph({ centerId: 1, firstHop, secondHop });
   const layout = computeLayout(graph, { label: (node) => node.key, centerLabel: 'Centre' });

   it('puts cited passages right, citing verses left and two-way links on the axis', () => {
      const x = (key: string): number => layout.index.get(key)?.x ?? Number.NaN;

      expect(x('1-1')).toBe(0);
      expect(x('10-10')).toBeGreaterThan(0);
      expect(x('12-14')).toBeGreaterThan(0);
      expect(x('20-20')).toBeLessThan(0);
      expect(x('30-30')).toBe(0);
      expect(layout.index.get('30-30')?.direction).toBe('both');
   });

   it('places second-hop verses outside the first hop, on the side of their parents', () => {
      const far = layout.index.get('500-500');
      const farLeft = layout.index.get('600-600');

      expect(far?.x).toBeGreaterThan(layout.index.get('10-10')?.x ?? 0);
      expect(farLeft?.x).toBeLessThan(layout.index.get('20-20')?.x ?? 0);
      expect(far?.parentKey).toBe('10-10');
      expect(layout.neighbors.get('500-500')).toEqual(new Set([ '10-10', '11-11' ]));
   });

   it('is deterministic and keeps every node inside the measured bounds', () => {
      const again = computeLayout(graph, { label: (node) => node.key, centerLabel: 'Centre' });

      expect(again.nodes.map((node) => [ node.key, node.x, node.y ])).toEqual(layout.nodes.map((node) => [ node.key, node.x, node.y ]));
      expect(new Set(layout.nodes.map((node) => node.key)).size).toBe(layout.nodes.length);

      for (const node of layout.nodes) {
         expect(node.x).toBeGreaterThanOrEqual(layout.bounds.minX);
         expect(node.x).toBeLessThanOrEqual(layout.bounds.maxX);
         expect(node.y).toBeGreaterThanOrEqual(layout.bounds.minY);
         expect(node.y).toBeLessThanOrEqual(layout.bounds.maxY);
      }
   });

   it('keeps rows apart on a crowded side', () => {
      const crowded = buildFirstHop({
         centerId: 1,
         outgoing: Array.from({ length: 120 }, (_, index) => edge(1, 100 + index)),
         incoming: [],
         direction: 'all',
         edgeKind: 'combined',
      });
      const placed = computeLayout(buildEgoGraph({ centerId: 1, firstHop: crowded }), { label: () => 'x', centerLabel: '' }).nodes.filter((node) => node.depth === 1);

      for (const node of placed) {
         const clash = placed.find((other) => other !== node && Math.hypot(other.x - node.x, other.y - node.y) < 10);

         expect(clash).toBeUndefined();
      }
   });

   it('spreads anchors with a minimum gap while staying near them', () => {
      const spread = spreadWithGap([ 0, 0, 0, 100 ], 10);

      expect(spread[1] - spread[0]).toBeGreaterThanOrEqual(10);
      expect(spread[2] - spread[1]).toBeGreaterThanOrEqual(10);
      expect(spread[1]).toBeCloseTo(0);
      expect(spread[3]).toBe(100);
   });

   it('fits the bounds into the viewport and builds link paths', () => {
      const view = fitTransform({ minX: -200, maxX: 200, minY: -100, maxY: 100 }, 400, 400, 0);

      expect(view.k).toBe(1);
      expect(view.x).toBe(200);
      expect(fitTransform({ minX: -400, maxX: 400, minY: -100, maxY: 100 }, 400, 400, 0).k).toBe(0.5);
      expect(linkPath({ x: 0, y: 0 }, 10, { x: 200, y: 50 }, 5)).toMatch(/^M12\.0,0\.0C.* 192\.0,50\.0$/);
      expect(linkPath({ x: 0, y: 0 }, 10, { x: 0, y: 100 }, 5)).toBe('M0.0,12.0L0.0,92.0');
   });

   it('finds the next node for arrow-key travel', () => {
      expect(nearestInDirection(layout.nodes, '1-1', 'right')?.x).toBeGreaterThan(0);
      expect(nearestInDirection(layout.nodes, '1-1', 'left')?.x).toBeLessThan(0);
      expect(nearestInDirection(layout.nodes, '1-1', 'up')?.key).toBe('30-30');
      expect(nearestInDirection(layout.nodes, 'missing', 'up')).toBeNull();
   });
});
