import { ChevronDown } from 'lucide-react';
import { useState } from 'react';

import { EmptyState } from '../../components/ui';
import { bookForNumber, chaptersInBook, type ChapterSummary, type ChapterVerse } from '../../data/chapterData';
import { useT } from '../../i18n';
import { cx } from '../../lib/cx';
import { chapterHref, navigate, type RouteParams } from '../../routing/routes';
import type { Book, DirectionMode, EdgeKindFilter, VerseIndex } from '../../types/generated';
import { formatNumber } from '../../utils/format';

export interface ChapterConnectionsProps {
   summary: ChapterSummary;
   books: Book[];
   currentBook: number;
   verses: ChapterVerse[];
   verseIndex: VerseIndex;
   kind: EdgeKindFilter;
   direction: DirectionMode;
   params: RouteParams;
   /** Max books shown before "show all". */
   limit?: number;
}

/** "This chapter connects to": ranked target books (bars), each expandable to its chapters. */
export function ChapterConnections({
   summary,
   books,
   currentBook,
   verses,
   verseIndex,
   kind,
   direction,
   params,
   limit = 12,
}: ChapterConnectionsProps): React.ReactElement {
   const t = useT();
   const [ expanded, setExpanded ] = useState<number | null>(null);
   const [ showAll, setShowAll ] = useState(false);
   const max = summary.books[0]?.count ?? 0;
   const visible = showAll ? summary.books : summary.books.slice(0, limit);

   if (summary.total === 0) {
      return <EmptyState title={t('read.chapter.none')} />;
   }

   return (
      <div className="read-cc">
         <p className="read-cc__summary t-caption">
            {t('read.chapter.summary', { count: formatNumber(summary.total), books: summary.books.length })}
         </p>
         <ol className="read-cc__bars">
            {visible.map((tally) => {
               const book = bookForNumber(books, tally.bookNumber);
               const name = book?.name ?? String(tally.bookNumber);
               const isOpen = expanded === tally.bookNumber;
               const chapters = isOpen && summary.source === 'adjacency'
                  ? chaptersInBook(verses, verseIndex, kind, direction, tally.bookNumber).slice(0, 8)
                  : [];

               return (
                  <li key={tally.bookNumber} className={cx('read-cc__row', isOpen && 'is-open')}>
                     <button
                        type="button"
                        className="read-cc__bar"
                        aria-expanded={summary.source === 'adjacency' ? isOpen : undefined}
                        aria-label={t('read.chapter.bookAria', { book: name, count: tally.count })}
                        onClick={() => setExpanded(isOpen ? null : tally.bookNumber)}
                        style={{ '--bar': (tally.count / Math.max(1, max)).toFixed(3) } as React.CSSProperties}
                     >
                        <span className="read-cc__name">
                           {name}
                           {tally.bookNumber === currentBook ? <span className="read-cc__self t-caption"> · {t('read.chapter.self')}</span> : null}
                        </span>
                        <span className="read-cc__value">{formatNumber(tally.count)}</span>
                        <span className="read-cc__track" aria-hidden="true">
                           <span className="read-cc__fill" />
                        </span>
                        {summary.source === 'adjacency' ? <ChevronDown size={14} className="read-cc__chevron" aria-hidden="true" /> : null}
                     </button>
                     {isOpen && chapters.length > 0 ? (
                        <ul className="read-cc__chapters">
                           {chapters.map((chapter) => {
                              const href = chapterHref({ bookNumber: chapter.bookNumber, chapterNumber: chapter.chapterNumber }, params);
                              const label = `${name} ${chapter.chapterNumber}`;

                              return (
                                 <li key={chapter.chapterNumber}>
                                    <a
                                       href={href}
                                       aria-label={t('read.chapter.open', { label })}
                                       onClick={(event) => {
                                          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                                          event.preventDefault();
                                          navigate(href);
                                       }}
                                    >
                                       <span>{label}</span>
                                       <span className="read-cc__chapter-count">{chapter.count}</span>
                                    </a>
                                 </li>
                              );
                           })}
                        </ul>
                     ) : null}
                  </li>
               );
            })}
         </ol>
         {summary.books.length > limit ? (
            <button
               type="button"
               className="read-cc__more"
               aria-label={showAll ? t('read.chapter.less') : t('read.chapter.more', { count: summary.books.length - limit })}
               onClick={() => setShowAll((value) => !value)}
            >
               {showAll ? '−' : `+${summary.books.length - limit}`}
            </button>
         ) : null}
         {summary.chapters.length > 0 ? (
            <section className="read-cc__top">
               <h3 className="t-eyebrow">{t('read.chapter.topChapters')}</h3>
               <ul className="read-cc__chips">
                  {summary.chapters.slice(0, 8).map((chapter) => {
                     const name = bookForNumber(books, chapter.bookNumber)?.shortName ?? String(chapter.bookNumber);
                     const href = chapterHref(chapter, params);

                     return (
                        <li key={`${chapter.bookNumber}.${chapter.chapterNumber}`}>
                           <a
                              className="ui-chip ui-chip--neutral ui-chip--sm ui-chip--interactive"
                              href={href}
                              onClick={(event) => {
                                 if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                                 event.preventDefault();
                                 navigate(href);
                              }}
                           >
                              <span className="ui-chip__label">{name} {chapter.chapterNumber}</span>
                              <span className="ui-chip__count">{chapter.count}</span>
                           </a>
                        </li>
                     );
                  })}
               </ul>
            </section>
         ) : null}
      </div>
   );
}
