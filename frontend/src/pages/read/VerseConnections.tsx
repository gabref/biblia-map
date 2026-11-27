import { ArrowRight, Bookmark, BookmarkCheck } from 'lucide-react';

import { VerseLink } from '../../components/VerseLink';
import { Button, EmptyState } from '../../components/ui';
import {
   bookForNumber,
   connectionLabel,
   groupByBook,
   verseConnections,
   type ChapterVerse,
} from '../../data/chapterData';
import { useT } from '../../i18n';
import { navigate, verseHref, type RouteParams } from '../../routing/routes';
import { isBookmarked, toggleBookmark, useBookmarks } from '../../study/store';
import type { Book, DirectionMode, EdgeKindFilter, VerseIndex } from '../../types/generated';
import { DirectionMeta } from './ChapterText';
import { useVerseTexts } from './useVerseTexts';

export interface VerseConnectionsProps {
   datasetId: string;
   books: Book[];
   verse: ChapterVerse;
   verseIndex: VerseIndex;
   kind: EdgeKindFilter;
   direction: DirectionMode;
   params: RouteParams;
   /** Study-note paragraphs for this verse (E-G), when available. */
   notes: string[] | null;
   lang?: string;
}

/** Connections of one verse grouped by book, plus study notes and "Study this verse". */
export function VerseConnections({
   datasetId,
   books,
   verse,
   verseIndex,
   kind,
   direction,
   params,
   notes,
   lang,
}: VerseConnectionsProps): React.ReactElement {
   const t = useT();
   const connections = verseConnections(verse, verseIndex, kind, direction);
   const groups = groupByBook(connections);
   const textFor = useVerseTexts(datasetId, books, connections.map((item) => item.ref));
   useBookmarks();
   const saved = isBookmarked(verse.ref);
   const studyHref = verseHref(verse.ref, params);

   return (
      <div className="read-vc">
         <div className="read-vc__head">
            <VerseLink verse={verse.ref} params={params} className="read-vc__ref t-title" />
            {verse.text ? <p className="read-vc__text t-scripture" lang={lang}>{verse.text}</p> : null}
            <div className="read-vc__actions">
               <Button
                  variant="primary"
                  size="sm"
                  trailing={<ArrowRight size={14} />}
                  onClick={() => navigate(studyHref)}
               >
                  {t('read.panel.study')}
               </Button>
               <Button
                  variant="ghost"
                  size="sm"
                  aria-pressed={saved}
                  leading={saved ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
                  onClick={() => toggleBookmark(verse.ref)}
               >
                  {saved ? t('study.bookmark.remove') : t('study.bookmark.add')}
               </Button>
            </div>
         </div>

         {notes && notes.length > 0 ? (
            <section className="read-vc__notes" aria-labelledby={`notes-${verse.ref.jwpubVerseId}`}>
               <h3 id={`notes-${verse.ref.jwpubVerseId}`} className="t-eyebrow">{t('read.panel.notes')}</h3>
               {notes.map((note, index) => (
                  <p key={index} lang={lang}>{note}</p>
               ))}
            </section>
         ) : null}

         <p className="read-vc__count t-eyebrow">{t('read.verse.count', { count: connections.length })}</p>

         {connections.length === 0 ? (
            <EmptyState title={t('read.panel.none')} />
         ) : (
            <div className="read-vc__groups">
               {groups.map((group) => {
                  const book = bookForNumber(books, group.bookNumber);

                  return (
                     <section key={group.bookNumber} className="read-vc__group" aria-label={book?.name}>
                        <h3 className="read-vc__book">
                           <span>{book?.name ?? '—'}</span>
                           <span className="read-vc__book-count">{group.items.length}</span>
                        </h3>
                        <ul className="read-vc__list">
                           {group.items.map((connection) => {
                              const text = textFor(connection.verseId);

                              return (
                                 <li
                                    key={`${connection.direction}:${connection.verseId}:${connection.endVerseId}`}
                                    className={`read-vc__item read-vc__item--${connection.direction}`}
                                 >
                                    {connection.ref ? (
                                       <VerseLink verse={connection.ref} params={params} className="read-vc__link t-ref">
                                          {connectionLabel(connection)}
                                       </VerseLink>
                                    ) : (
                                       <span className="t-ref">{connectionLabel(connection)}</span>
                                    )}
                                    <span className="read-vc__meta t-caption"><DirectionMeta connection={connection} /></span>
                                    {text === undefined ? (
                                       <span className="read-vc__skeleton" aria-hidden="true" />
                                    ) : text ? (
                                       <p className="read-vc__snippet" lang={lang}>{text}</p>
                                    ) : null}
                                 </li>
                              );
                           })}
                        </ul>
                     </section>
                  );
               })}
            </div>
         )}
      </div>
   );
}
