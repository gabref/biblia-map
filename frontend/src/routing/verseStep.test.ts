import { describe, expect, it } from 'vitest';

import { adjacentVerse, onVerseStep, requestVerseStep } from './verseStep';

const john = (chapterNumber: number, verseNumber: number) => ({ bookNumber: 43, chapterNumber, verseNumber });
// John 3 has 36 verses, John 2 has 25.
const lengths = (bookNumber: number, chapterNumber: number): number | undefined =>
   bookNumber === 43 ? ({ 2: 25, 3: 36, 21: 25 } as Record<number, number>)[chapterNumber] : undefined;

describe('adjacentVerse', () => {
   it('steps inside a chapter', () => {
      expect(adjacentVerse(john(3, 16), 1, lengths)).toEqual(john(3, 17));
      expect(adjacentVerse(john(3, 16), -1, lengths)).toEqual(john(3, 15));
   });

   it('crosses chapters when lengths are known', () => {
      expect(adjacentVerse(john(3, 36), 1, lengths)).toEqual(john(4, 1));
      expect(adjacentVerse(john(3, 1), -1, lengths)).toEqual(john(2, 25));
   });

   it('stops at book boundaries', () => {
      expect(adjacentVerse(john(1, 1), -1, lengths)).toBeNull();
      expect(adjacentVerse(john(21, 25), 1, lengths)).toBeNull();
   });

   it('without lengths, next stays in the chapter and previous stops at verse 1', () => {
      expect(adjacentVerse(john(3, 36), 1)).toEqual(john(3, 37));
      expect(adjacentVerse(john(3, 1), -1)).toBeNull();
   });
});

describe('verse step event', () => {
   it('reports unhandled requests as false', () => {
      expect(requestVerseStep(1)).toBe(false);
   });

   it('lets a listener take over with preventDefault', () => {
      const seen: number[] = [];
      const off = onVerseStep((delta, event) => {
         seen.push(delta);
         event.preventDefault();
      });

      expect(requestVerseStep(-1)).toBe(true);
      expect(seen).toEqual([ -1 ]);

      off();
      expect(requestVerseStep(1)).toBe(false);
      expect(seen).toEqual([ -1 ]);
   });
});
