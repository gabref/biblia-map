import { ChevronLeft, ChevronRight } from 'lucide-react';

import { IconButton, Select } from '../../components/ui';
import { adjacentChapter, bookForNumber } from '../../data/chapterData';
import { useT } from '../../i18n';
import { BOOKS, chapterHref, navigate, type RouteParams } from '../../routing/routes';
import type { Book } from '../../types/generated';

export interface ChapterNavProps {
   books: Book[];
   bookNumber: number;
   chapterNumber: number;
   params: RouteParams;
}

export function goToChapter(bookNumber: number, chapterNumber: number, params: RouteParams): void {
   navigate(chapterHref({ bookNumber, chapterNumber }, params));
}

/** Prev/next chapter buttons and a book + chapter picker (native selects: best on phones). */
export function ChapterNav({ books, bookNumber, chapterNumber, params }: ChapterNavProps): React.ReactElement {
   const t = useT();
   const prev = adjacentChapter(bookNumber, chapterNumber, -1);
   const next = adjacentChapter(bookNumber, chapterNumber, 1);
   const chapterCount = BOOKS[bookNumber - 1]?.chapters ?? 1;
   const label = (pointer: { bookNumber: number; chapterNumber: number }): string =>
      `${bookForNumber(books, pointer.bookNumber)?.name ?? ''} ${pointer.chapterNumber}`;

   return (
      <nav className="read-nav" aria-label={t('read.nav.label')}>
         <IconButton
            label={prev ? `${t('read.nav.prev')}: ${label(prev)}` : t('read.nav.prev')}
            variant="secondary"
            disabled={!prev}
            onClick={() => prev && goToChapter(prev.bookNumber, prev.chapterNumber, params)}
         >
            <ChevronLeft size={18} />
         </IconButton>
         <Select
            aria-label={t('read.nav.book')}
            className="read-nav__book"
            value={String(bookNumber)}
            options={BOOKS.map((book) => ({
               value: String(book.bookNumber),
               label: bookForNumber(books, book.bookNumber)?.name ?? book.nameEn,
            }))}
            onChange={(value) => goToChapter(Number(value), 1, params)}
         />
         <Select
            aria-label={t('read.nav.chapter')}
            className="read-nav__chapter"
            value={String(chapterNumber)}
            options={Array.from({ length: chapterCount }, (_, index) => ({ value: String(index + 1), label: String(index + 1) }))}
            onChange={(value) => goToChapter(bookNumber, Number(value), params)}
         />
         <IconButton
            label={next ? `${t('read.nav.next')}: ${label(next)}` : t('read.nav.next')}
            variant="secondary"
            disabled={!next}
            onClick={() => next && goToChapter(next.bookNumber, next.chapterNumber, params)}
         >
            <ChevronRight size={18} />
         </IconButton>
      </nav>
   );
}
