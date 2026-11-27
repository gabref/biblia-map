import type { MessageKey } from '../../i18n';

export type CanonSectionId = 'law' | 'history' | 'poetry' | 'prophets' | 'gospels' | 'letters' | 'revelation';

export interface CanonSection {
   id: CanonSectionId;
   /** First and last book number, inclusive. */
   first: number;
   last: number;
   /** CSS custom property holding the section colour (both themes). */
   color: string;
   labelKey: MessageKey;
}

/** The seven canon sections of design-spec §8.2. "Gospels" includes Acts (the narrative books). */
export const CANON_SECTIONS: readonly CanonSection[] = [
   { id: 'law', first: 1, last: 5, color: 'var(--canon-law)', labelKey: 'insights.canon.law' },
   { id: 'history', first: 6, last: 17, color: 'var(--canon-history)', labelKey: 'insights.canon.history' },
   { id: 'poetry', first: 18, last: 22, color: 'var(--canon-poetry)', labelKey: 'insights.canon.poetry' },
   { id: 'prophets', first: 23, last: 39, color: 'var(--canon-prophets)', labelKey: 'insights.canon.prophets' },
   { id: 'gospels', first: 40, last: 44, color: 'var(--canon-gospels)', labelKey: 'insights.canon.gospels' },
   { id: 'letters', first: 45, last: 65, color: 'var(--canon-letters)', labelKey: 'insights.canon.letters' },
   { id: 'revelation', first: 66, last: 66, color: 'var(--canon-revelation)', labelKey: 'insights.canon.revelation' },
];

export function canonSection(bookNumber: number): CanonSection {
   return CANON_SECTIONS.find((section) => bookNumber >= section.first && bookNumber <= section.last)
      ?? CANON_SECTIONS[CANON_SECTIONS.length - 1];
}

export function canonSectionIndex(bookNumber: number): number {
   return CANON_SECTIONS.indexOf(canonSection(bookNumber));
}

export function canonColor(bookNumber: number): string {
   return canonSection(bookNumber).color;
}

/** Hebrew-Aramaic Scriptures are books 1–39. */
export function isHebrewBook(bookNumber: number): boolean {
   return bookNumber <= 39;
}
