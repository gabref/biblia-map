import { describe, expect, it } from 'vitest';

import { buildRelatedNodes } from './VersePage';

describe('buildRelatedNodes', () => {
   it('groups outgoing edges by target verse and applies edge-kind filters', () => {
      const nodes = buildRelatedNodes({
         selectedVerseId: 100,
         direction: 'outgoing',
         edgeKind: 'crossrefs',
         adjacency: {
            '100': {
               outgoing: [
                  {
                     source: 100,
                     targetStart: 200,
                     targetEnd: 200,
                     kind: 0,
                  },
                  {
                     source: 100,
                     targetStart: 200,
                     targetEnd: 200,
                     kind: 0,
                  },
                  {
                     source: 100,
                     targetStart: 300,
                     targetEnd: 300,
                     kind: 1,
                  },
               ],
            },
         },
         verseIndex: {
            '200': {
               jwpubVerseId: 200,
               canonicalVerseId: 45_012_012,
               bookNumber: 45,
               chapterNumber: 12,
               verseNumber: 12,
               label: 'Romans 12:12',
            },
         },
      });

      expect(nodes).toHaveLength(1);
      expect(nodes[0]).toMatchObject({
         verseId: 200,
         label: 'Romans 12:12',
         count: 2,
      });
   });
});
