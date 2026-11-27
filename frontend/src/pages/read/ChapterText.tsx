import { Bookmark } from 'lucide-react';
import { memo } from 'react';

import { Tooltip, VerseCard } from '../../components/ui';
import {
   connectionLabel,
   heatLevel,
   heatStep,
   topConnections,
   verseConnections,
   type ChapterVerse,
   type Connection,
   type VerseDegreeFile,
} from '../../data/chapterData';
import { useT } from '../../i18n';
import { cx } from '../../lib/cx';
import type { Book, DirectionMode, EdgeKindFilter, VerseIndex } from '../../types/generated';
import { useVerseTexts } from './useVerseTexts';

export interface ChapterTextProps {
   datasetId: string;
   books: Book[];
   verses: ChapterVerse[];
   counts: number[];
   maxCount: number;
   verseIndex: VerseIndex;
   kind: EdgeKindFilter;
   direction: DirectionMode;
   verseDegree: VerseDegreeFile | null;
   showHeat: boolean;
   selectedVerse: number | null;
   bookmarked: ReadonlySet<number>;
   /** Dataset language code for `lang` (hyphenation, screen-reader voice). */
   lang?: string;
   /** Pointer/Enter on a verse: open its connections. */
   onOpen: (verseNumber: number) => void;
   /** Keyboard focus moved to a verse (j/k or Tab). */
   onFocusVerse: (verseNumber: number) => void;
}

const PREVIEW_LIMIT = 3;

/** DOM id of a verse row, also the `#v<N>` deep-link target. */
export function verseElementId(verseNumber: number): string {
   return `v${verseNumber}`;
}

export function ChapterText(props: ChapterTextProps): React.ReactElement {
   const t = useT();
   const { verses, counts, selectedVerse, bookmarked, showHeat, lang, ...rowProps } = props;
   const hasText = verses.some((verse) => verse.text !== null);

   return (
      <div className={cx('read-text t-scripture', showHeat && 'read-text--heat')} lang={lang} aria-label={t('read.text.label')}>
         {!hasText ? <p className="read-text__missing t-caption">{t('read.text.missing')}</p> : null}
         <ol className="read-verses">
            {verses.map((verse, index) => (
               <VerseRow
                  key={verse.ref.jwpubVerseId}
                  {...rowProps}
                  verse={verse}
                  count={counts[index] ?? 0}
                  selected={selectedVerse === verse.ref.verseNumber}
                  isBookmarked={bookmarked.has(verse.ref.verseNumber)}
               />
            ))}
         </ol>
      </div>
   );
}

interface VerseRowProps extends Omit<ChapterTextProps, 'verses' | 'counts' | 'selectedVerse' | 'bookmarked' | 'showHeat' | 'lang'> {
   verse: ChapterVerse;
   count: number;
   selected: boolean;
   isBookmarked: boolean;
}

const VerseRow = memo(function VerseRow({
   datasetId,
   books,
   verse,
   count,
   maxCount,
   verseIndex,
   kind,
   direction,
   verseDegree,
   selected,
   isBookmarked,
   onOpen,
   onFocusVerse,
}: VerseRowProps): React.ReactElement {
   const t = useT();
   const verseNumber = verse.ref.verseNumber;
   const step = heatStep(count, maxCount);
   const style = { '--heat': heatLevel(count, maxCount).toFixed(3) } as React.CSSProperties;

   const handleClick = (): void => {
      // Let people select text to copy without opening the panel.
      if (window.getSelection()?.toString()) return;
      onOpen(verseNumber);
   };

   const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
      if (event.key === 'Enter' || event.key === ' ') {
         event.preventDefault();
         onOpen(verseNumber);
      }
   };

   const preview = count > 0 ? (
      <VersePreview
         datasetId={datasetId}
         books={books}
         verse={verse}
         verseIndex={verseIndex}
         kind={kind}
         direction={direction}
         verseDegree={verseDegree}
         total={count}
      />
   ) : null;

   return (
      <li className="read-verse-item">
         <Tooltip content={preview} variant="card" side="bottom" delay={400}>
            <div
               id={verseElementId(verseNumber)}
               role="button"
               tabIndex={0}
               className={cx('read-verse', selected && 'is-selected')}
               data-heat={step}
               style={style}
               aria-pressed={selected}
               onClick={handleClick}
               onKeyDown={handleKeyDown}
               onFocus={() => onFocusVerse(verseNumber)}
            >
               <span className="read-verse__heat" aria-hidden="true" />
               <span className="read-verse__num" aria-hidden="true">{verseNumber}</span>
               {/* The accessible name is the content (WCAG 2.5.3 label in name): the number, count and
                  saved state are spoken from this hidden prefix, then the verse text itself. */}
               <span className="visually-hidden">
                  {`${t('read.verse.aria', { verse: verseNumber, count })}${isBookmarked ? `, ${t('read.verse.saved')}` : ''}: `}
               </span>
               <span className="read-verse__body">{verse.text ?? verse.ref.label}</span>
               <span className="read-verse__meta" aria-hidden="true">
                  {isBookmarked ? <Bookmark size={12} className="read-verse__saved" /> : null}
                  {count > 0 ? <span className="read-verse__count">{count}</span> : null}
               </span>
            </div>
         </Tooltip>
      </li>
   );
});

interface VersePreviewProps {
   datasetId: string;
   books: Book[];
   verse: ChapterVerse;
   verseIndex: VerseIndex;
   kind: EdgeKindFilter;
   direction: DirectionMode;
   verseDegree: VerseDegreeFile | null;
   total: number;
}

/** Hover / focus card: the verse's top references with their text. Mounted only while open. */
function VersePreview({ datasetId, books, verse, verseIndex, kind, direction, verseDegree }: VersePreviewProps): React.ReactElement {
   const t = useT();
   const connections = verseConnections(verse, verseIndex, kind, direction);
   const top = topConnections(connections, PREVIEW_LIMIT, verseDegree);
   const textFor = useVerseTexts(datasetId, books, top.map((item) => item.ref));

   return (
      <div className="read-preview">
         <p className="read-preview__title t-eyebrow">
            {verse.ref.label} · {t('read.verse.count', { count: connections.length })}
         </p>
         <div className="read-preview__list">
            {top.map((connection) => (
               <VerseCard
                  key={`${connection.direction}:${connection.verseId}:${connection.endVerseId}`}
                  reference={connectionLabel(connection)}
                  text={textFor(connection.verseId)}
                  tone={connection.direction}
                  density="compact"
                  meta={<DirectionMeta connection={connection} />}
               />
            ))}
         </div>
         {connections.length > top.length ? (
            <p className="read-preview__more t-caption">{t('read.preview.more', { count: connections.length - top.length })}</p>
         ) : null}
      </div>
   );
}

export function DirectionMeta({ connection }: { connection: Connection }): React.ReactElement {
   const t = useT();
   const kinds = connection.kinds
      .map((kind) => (kind === 1 ? t('read.panel.kind.studyNote') : t('read.panel.kind.crossref')))
      .join(' · ');

   return (
      <span className="read-dir-meta">
         <span aria-hidden="true">{connection.direction === 'outgoing' ? '→' : '←'}</span>{' '}
         {connection.direction === 'outgoing' ? t('read.panel.outgoing') : t('read.panel.incoming')} · {kinds}
      </span>
   );
}
