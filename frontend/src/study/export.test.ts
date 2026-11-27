import { describe, expect, it } from 'vitest';

import { buildExportFile, buildStudySheet, exportFileName, exportStudyJson } from './export';
import { emptyStudyData } from './schema';
import { rangeLabel } from './verseText';

const now = new Date('2026-11-27T10:00:00Z');

describe('JSON export', () => {
   it('wraps data in a versioned envelope', () => {
      const data = emptyStudyData();
      const file = buildExportFile(data, now);

      expect(file).toEqual({ format: 'bibliamap-study', version: 1, exportedAt: '2026-11-27T10:00:00.000Z', data });
      expect(JSON.parse(exportStudyJson(data, now))).toEqual(file);
   });

   it('builds safe file names', () => {
      expect(exportFileName('json', undefined, now)).toBe('bibliamap-study-2026-11-27.json');
      expect(exportFileName('md', 'Talk: Dio è amore!', now)).toBe('bibliamap-talk-dio-e-amore-2026-11-27.md');
      expect(exportFileName('md', '!!!', now)).toBe('bibliamap-study-2026-11-27.md');
   });
});

describe('Markdown study sheet', () => {
   it('renders title, notes, quoted verse text and connections', () => {
      const markdown = buildStudySheet({
         title: 'Talk: Love',
         note: 'Theme: love that acts.',
         datasetTitle: 'NWT Study Edition',
         generatedAt: now,
         verses: [
            {
               key: '43.3.16',
               label: 'John 3:16',
               text: 'For God loved the world so much…\nSecond line',
               note: 'Key verse',
               connections: [ { key: '62.4.9', label: '1 John 4:9', text: 'By this the love of God was revealed' }, { key: '45.5.8', label: 'Romans 5:8', text: null } ],
            },
            { key: '1.1.1', label: 'Genesis 1:1', text: null },
         ],
      });

      expect(markdown).toBe([
         '# Talk: Love',
         '',
         '_Study sheet · NWT Study Edition · November 27, 2026_',
         '',
         'Theme: love that acts.',
         '',
         '## John 3:16',
         '',
         '> For God loved the world so much…',
         '> Second line',
         '',
         '**My note**',
         '',
         'Key verse',
         '',
         '**Connected verses**',
         '',
         '- **1 John 4:9** — By this the love of God was revealed',
         '- **Romans 5:8**',
         '',
         '## Genesis 1:1',
         '',
         '_Verse text is not included in this dataset._',
         '',
      ].join('\n'));
   });

   it('says when the collection is empty', () => {
      expect(buildStudySheet({ title: '', verses: [], generatedAt: now })).toContain('# Untitled collection');
      expect(buildStudySheet({ title: 'X', verses: [], generatedAt: now })).toContain('_No verses in this collection yet._');
   });
});

describe('rangeLabel', () => {
   const start = { bookNumber: 43, chapterNumber: 3, verseNumber: 16 };

   it('formats single verses and ranges', () => {
      expect(rangeLabel('John 3:16', start)).toBe('John 3:16');
      expect(rangeLabel('John 3:16', start, start)).toBe('John 3:16');
      expect(rangeLabel('John 3:16', start, { ...start, verseNumber: 18 })).toBe('John 3:16-18');
      expect(rangeLabel('John 3:16', start, { ...start, chapterNumber: 4, verseNumber: 2 })).toBe('John 3:16–4:2');
   });
});
