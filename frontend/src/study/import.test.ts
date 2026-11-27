import { describe, expect, it } from 'vitest';

import { exportStudyJson } from './export';
import { parseImportText, planImport } from './import';
import { emptyStudyData, migrateStudyData, type StudyData } from './schema';

function data(partial: Partial<StudyData>): StudyData {
   return { ...emptyStudyData(), ...partial };
}

const local = data({
   collections: [
      { id: 'saved', name: 'Saved', createdAt: 0 },
      { id: 'talk-love-ab12', name: 'Talk: Love', createdAt: 10, note: { text: 'Intro', updatedAt: 10 } },
   ],
   bookmarks: [
      { key: '43.3.16', collectionId: 'saved', createdAt: 1 },
      { key: '1.1.1', collectionId: 'talk-love-ab12', createdAt: 2 },
   ],
   notes: { '43.3.16': { text: 'God so loved', updatedAt: 5 } },
   history: [ { key: '43.3.16', visitedAt: 100 } ],
});

describe('parseImportText', () => {
   it('accepts an export file and a raw stored document', () => {
      const exported = parseImportText(exportStudyJson(local));
      expect(exported.ok && exported.data).toEqual(local);

      const raw = parseImportText(JSON.stringify(local));
      expect(raw.ok).toBe(true);
   });

   it('rejects non-JSON, foreign JSON, unknown versions and empty input', () => {
      expect(parseImportText('')).toEqual({ ok: false, error: 'empty' });
      expect(parseImportText('{oops')).toEqual({ ok: false, error: 'json' });
      expect(parseImportText('[1,2]')).toEqual({ ok: false, error: 'format' });
      expect(parseImportText('{"hello":"world"}')).toEqual({ ok: false, error: 'format' });
      expect(parseImportText('{"format":"other","version":1,"data":{}}')).toEqual({ ok: false, error: 'format' });
      expect(parseImportText(JSON.stringify({ format: 'bibliamap-study', version: 99, data: { collections: [] } }))).toEqual({ ok: false, error: 'version' });
   });

   it('counts dropped malformed entries', () => {
      const parsed = parseImportText(JSON.stringify({
         format: 'bibliamap-study',
         version: 1,
         data: { collections: [], bookmarks: [ { key: 'x', collectionId: 'saved' } ], notes: {}, history: [ { nope: true } ] },
      }));

      expect(parsed.ok && parsed.dropped).toBe(2);
   });
});

describe('planImport', () => {
   it('is a no-op when importing the same data', () => {
      const { next, summary } = planImport(local, local);

      expect(summary.nothingNew).toBe(true);
      expect(next.bookmarks).toEqual(local.bookmarks);
      expect(next.notes).toEqual(local.notes);
      expect(next.collections).toEqual(local.collections);
   });

   it('merges without deleting or overwriting local data', () => {
      const incoming = data({
         collections: [
            { id: 'saved', name: 'Saved', createdAt: 0 },
            // Same name, different id (made on another device) → merged into the local one.
            { id: 'talk-love-zz99', name: 'talk: love', createdAt: 20, note: { text: 'Conclusion', updatedAt: 30 } },
            { id: 'faith-cd34', name: 'Faith', createdAt: 30 },
         ],
         bookmarks: [
            { key: '43.3.16', collectionId: 'saved', createdAt: 1 },
            { key: '45.5.8', collectionId: 'talk-love-zz99', createdAt: 3, endKey: '45.5.9' },
            { key: '58.11.1', collectionId: 'faith-cd34', createdAt: 4 },
         ],
         notes: {
            '43.3.16': { text: 'Different thought', updatedAt: 50 },
            '45.5.8': { text: 'While sinners', updatedAt: 6 },
         },
         history: [ { key: '43.3.16', visitedAt: 200, datasetId: 'rbi8' }, { key: '45.5.8', visitedAt: 150 } ],
      });

      const { next, summary } = planImport(local, incoming, 2);

      expect(summary).toEqual({
         collectionsAdded: 1,
         bookmarksAdded: 2,
         notesAdded: 1,
         notesMerged: 2,
         historyAdded: 1,
         dropped: 2,
         nothingNew: false,
      });
      expect(next.collections.map((item) => item.id)).toEqual([ 'saved', 'talk-love-ab12', 'faith-cd34' ]);
      expect(next.collections[1].name).toBe('Talk: Love');
      expect(next.collections[1].note?.text).toBe('Intro\n\nConclusion');
      expect(next.bookmarks).toContainEqual({ key: '45.5.8', collectionId: 'talk-love-ab12', createdAt: 3, endKey: '45.5.9' });
      expect(next.bookmarks).toContainEqual(local.bookmarks[1]);
      expect(next.notes['43.3.16'].text).toBe('God so loved\n\nDifferent thought');
      expect(next.notes['45.5.8'].text).toBe('While sinners');
      expect(next.history.map((entry) => entry.key)).toEqual([ '43.3.16', '45.5.8' ]);
      expect(next.history[0]).toEqual({ key: '43.3.16', visitedAt: 200, datasetId: 'rbi8' });

      // Re-importing the same file changes nothing more.
      const again = planImport(next, incoming);
      expect(again.summary.nothingNew).toBe(true);
      expect(again.next.notes).toEqual(next.notes);
   });

   it('takes the imported note when it extends the local one', () => {
      const incoming = data({ notes: { '43.3.16': { text: 'God so loved the world', updatedAt: 9 } } });
      const { next, summary } = planImport(local, incoming);

      expect(next.notes['43.3.16'].text).toBe('God so loved the world');
      expect(summary.notesMerged).toBe(1);
   });

   it('produces data that passes validation', () => {
      const { next } = planImport(local, data({ bookmarks: [ { key: '1.1.2', collectionId: 'saved', createdAt: 1 } ] }));

      expect(migrateStudyData(next)).toEqual(next);
   });
});
