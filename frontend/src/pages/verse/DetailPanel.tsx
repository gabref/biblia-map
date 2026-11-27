import { ArrowRight, BookOpen, Copy, Crosshair, ExternalLink } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { SaveVerseButton } from '../../components/SaveVerseButton';
import { VerseLink } from '../../components/VerseLink';
import { Button, Chip, Skeleton } from '../../components/ui';
import { formatPassageLabel, type NeighborEdge, type NeighborNode } from '../../graph/neighborhood';
import { useT } from '../../i18n';
import { verseKey } from '../../study/store';
import type { RouteParams } from '../../routing/routes';
import type { Book, StudyNotesBook, VerseRef } from '../../types/generated';
import type { VerseCatalog } from './catalog';
import { loadStudyNoteBook, studyNoteExcerpt, type NoteExcerpt } from './studyNotes';

export interface PassageVerse {
   ref: VerseRef;
   text: string | null | undefined;
}

/** Everything a detail panel needs that does not depend on which node is open. */
export interface DetailContext {
   datasetId: string;
   catalog: VerseCatalog;
   bookMap: Map<number, Book>;
   /** Whether this dataset ships study-note text (E-G `study-note-text` feature). */
   studyNoteText: boolean;
   /** Query params verse links inside a note carry over (the edition). */
   linkParams: RouteParams | undefined;
   /** BCP 47 language of scripture text. */
   lang: string | undefined;
   passageVerses: (node: NeighborNode) => PassageVerse[];
   labelOf: (key: string) => string | null;
   chapterHref: (verse: VerseRef) => string;
   /** jw.org finder link for a verse or range (opens JW Library when installed); `null` hides it. */
   jwLibraryHref: (first: VerseRef, last: VerseRef | undefined) => string | null;
   onStudy: (key: string) => void;
   onSelect: (key: string | null) => void;
   onCopy: (key: string) => void;
   onNavigate: (event: React.MouseEvent<HTMLAnchorElement>) => void;
}

export interface DetailPanelProps {
   node: NeighborNode;
   label: string;
   context: DetailContext;
}

interface EdgeLine {
   id: string;
   kind: number;
   from: string;
   to: string;
   count: number;
   note: NoteExcerpt | null;
}

/** Notes of the books the open connection's study-note edges come from (lazy, optional). */
function useStudyNotes(context: DetailContext, edges: readonly NeighborEdge[]): Map<number, StudyNotesBook | null> {
   const [ notes, setNotes ] = useState<Map<number, StudyNotesBook | null>>(() => new Map());
   const bookNumbers = useMemo(() => {
      if (!context.studyNoteText) {
         return '';
      }

      const books = new Set<number>();

      for (const { edge } of edges) {
         const bookNumber = edge.kind === 1 ? context.catalog.bookOf(edge.source) : null;

         if (bookNumber !== null) {
            books.add(bookNumber);
         }
      }

      return Array.from(books).sort((a, b) => a - b).join(',');
   }, [ context, edges ]);

   useEffect(() => {
      if (!bookNumbers) {
         return undefined;
      }

      let active = true;

      for (const bookNumber of bookNumbers.split(',').map(Number)) {
         void loadStudyNoteBook(context.datasetId, bookNumber).then((loaded) => {
            if (active) {
               setNotes((previous) => new Map(previous).set(bookNumber, loaded));
            }
         });
      }

      return () => {
         active = false;
      };
   }, [ bookNumbers, context ]);

   return notes;
}

/**
 * Why a verse is connected: the full passage, every reference behind the link (not just the
 * first), the study note that made it when the dataset has the text, and what to do next.
 */
export function DetailPanel({ node, label, context }: DetailPanelProps): React.ReactElement {
   const t = useT();
   const notes = useStudyNotes(context, node.edges);
   const verses = context.passageVerses(node);
   const first = verses[0]?.ref;
   const last = verses[verses.length - 1]?.ref;
   const lines = useMemo(() => {
      const grouped = new Map<string, EdgeLine>();

      for (const { edge } of node.edges) {
         const id = `${edge.kind}:${edge.source}:${edge.targetStart}:${edge.targetEnd}:${edge.commentaryId ?? ''}`;
         const existing = grouped.get(id);

         if (existing) {
            existing.count += 1;
            continue;
         }

         const sourceBook = context.catalog.bookOf(edge.source);

         grouped.set(id, {
            id,
            kind: edge.kind,
            from: formatPassageLabel(edge.source, edge.source, context.catalog.byId),
            to: formatPassageLabel(edge.targetStart, edge.targetEnd, context.catalog.byId),
            count: 1,
            note: sourceBook === null ? null : studyNoteExcerpt(notes.get(sourceBook), edge),
         });
      }

      return Array.from(grouped.values());
   }, [ context, node, notes ]);
   const via = node.via
      .map((link) => ({ key: link.from, label: context.labelOf(link.from) }))
      .filter((item): item is { key: string; label: string } => item.label !== null);

   return (
      <div className="vs-detail anim-fade-in">
         <div className="vs-detail__passage t-scripture" lang={context.lang}>
            {verses.map(({ ref, text }) => (
               <span key={ref.jwpubVerseId}>
                  {verses.length > 1 ? <sup className="vs-detail__num">{ref.verseNumber}</sup> : null}
                  {text === undefined ? <Skeleton lines={2} /> : (text ?? <em className="vs-detail__missing">{t('verse.text.missing')}</em>)}{' '}
               </span>
            ))}
         </div>

         <div className="vs-detail__why">
            <p className="t-eyebrow">{node.depth === 2 ? t('verse.detail.whyFar') : t('verse.detail.why')}</p>
            <ul className="vs-detail__edges">
               {lines.map((line) => (
                  <li key={line.id} className="vs-detail__edge">
                     <Chip size="sm" tone={line.kind === 1 ? 'accent' : 'neutral'}>
                        {line.kind === 1 ? t('verse.kind.studyNote') : t('verse.kind.crossRef')}
                     </Chip>
                     <span className="vs-detail__route">
                        <span className="t-ref">{line.from}</span>
                        <ArrowRight size={13} aria-hidden="true" />
                        <span className="visually-hidden">{t('verse.detail.cites')}</span>
                        <span className="t-ref">{line.to}</span>
                        {line.count > 1 ? <span className="t-caption"> ×{line.count}</span> : null}
                     </span>
                     {line.note ? (
                        <blockquote className="vs-detail__note">
                           {line.note.lemma ? <strong className="vs-detail__lemma">{line.note.lemma}: </strong> : null}
                           {line.note.clippedStart ? '… ' : null}
                           {line.note.segments.map((segment, index) => {
                              const target = segment.ref ? context.catalog.byId(segment.ref.from) : undefined;

                              return target ? (
                                 <VerseLink
                                    key={index}
                                    verse={target}
                                    params={context.linkParams}
                                    className={segment.ref?.cited ? 'vs-detail__cite is-cited' : 'vs-detail__cite'}
                                 >
                                    {segment.text}
                                 </VerseLink>
                              ) : (
                                 <span key={index}>{segment.text}</span>
                              );
                           })}
                           {line.note.clippedEnd ? ' …' : null}
                        </blockquote>
                     ) : null}
                  </li>
               ))}
            </ul>
         </div>

         {via.length > 0 ? (
            <div className="vs-detail__via">
               <p className="t-eyebrow">{t('verse.detail.via')}</p>
               <div className="vs-detail__chips">
                  {via.map((item) => (
                     <Chip key={item.key} size="sm" onClick={() => context.onSelect(item.key)}>
                        {item.label}
                     </Chip>
                  ))}
               </div>
            </div>
         ) : null}

         <div className="vs-detail__actions">
            <Button variant="primary" size="sm" leading={<Crosshair size={15} />} onClick={() => context.onStudy(node.key)}>
               {t('verse.action.studyThis')}
            </Button>
            {first ? (
               <a className="ui-button ui-button--ghost ui-button--sm" href={context.chapterHref(first)} onClick={context.onNavigate}>
                  <BookOpen size={15} aria-hidden="true" />
                  <span className="ui-button__label">{t('verse.action.readInContext')}</span>
               </a>
            ) : null}
            {first ? (
               <SaveVerseButton
                  verse={first}
                  label={label}
                  size="sm"
                  endKey={last && last !== first ? verseKey(last) : undefined}
               />
            ) : null}
            {first && context.jwLibraryHref(first, last) ? (
               <a
                  className="ui-button ui-button--ghost ui-button--sm"
                  href={context.jwLibraryHref(first, last) as string}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={t('verse.action.openInJwLibraryHint', { verse: label })}
               >
                  <ExternalLink size={15} aria-hidden="true" />
                  <span className="ui-button__label">{t('verse.action.openInJwLibrary')}</span>
               </a>
            ) : null}
            <Button variant="ghost" size="sm" leading={<Copy size={15} />} onClick={() => context.onCopy(node.key)}>
               {t('verse.action.copyShort')}
            </Button>
         </div>
      </div>
   );
}
