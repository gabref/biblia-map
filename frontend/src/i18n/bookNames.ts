/**
 * Static UI-language book names, for labels that must render before (or without) a dataset's
 * `books.json` — e.g. bookmarks and history. When a dataset is loaded, its own `books.json`
 * names remain the source of truth for that edition's text.
 *
 * Italian names match `public/generated/nwtsty-i/books.json` (`name`).
 */
import { bookByNumber } from '../routing/bookSlugs';
import type { Locale } from './locale';

const IT_BOOK_NAMES: readonly string[] = [
   'Genesi', 'Esodo', 'Levitico', 'Numeri', 'Deuteronomio', 'Giosuè', 'Giudici', 'Rut', '1 Samuele', '2 Samuele',
   '1 Re', '2 Re', '1 Cronache', '2 Cronache', 'Esdra', 'Neemia', 'Ester', 'Giobbe', 'Salmi', 'Proverbi',
   'Ecclesiaste', 'Cantico dei Cantici', 'Isaia', 'Geremia', 'Lamentazioni', 'Ezechiele', 'Daniele', 'Osea', 'Gioele', 'Amos',
   'Abdia', 'Giona', 'Michea', 'Naum', 'Abacuc', 'Sofonia', 'Aggeo', 'Zaccaria', 'Malachia', 'Matteo',
   'Marco', 'Luca', 'Giovanni', 'Atti', 'Romani', '1 Corinti', '2 Corinti', 'Galati', 'Efesini', 'Filippesi',
   'Colossesi', '1 Tessalonicesi', '2 Tessalonicesi', '1 Timoteo', '2 Timoteo', 'Tito', 'Filemone', 'Ebrei', 'Giacomo', '1 Pietro',
   '2 Pietro', '1 Giovanni', '2 Giovanni', '3 Giovanni', 'Giuda', 'Rivelazione',
];

/** Book name in the UI language; `null` for an unknown book number. */
export function bookName(bookNumber: number, locale: Locale): string | null {
   if (locale === 'it') {
      return IT_BOOK_NAMES[bookNumber - 1] ?? null;
   }

   return bookByNumber(bookNumber)?.nameEn ?? null;
}
