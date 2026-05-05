import { ArrowDownToLine, ArrowUpFromLine, BookMarked, Blocks, GitBranch, Landmark, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { ErrorState } from '../components/ErrorState';
import { LoadingShimmer } from '../components/LoadingShimmer';
import { PageHeader } from '../components/PageHeader';
import { StatCard } from '../components/StatCard';
import { loadBookMatrix, loadBooks, loadCompactEdges, loadManifest, loadStatsSummary, loadVerseIndex } from '../data/generated';
import { useAsyncData } from '../hooks/useAsyncData';
import type { Book, BookMatrix, CompactEdges, VerseIndex, VerseRef } from '../types/generated';
import { formatNumber, formatPercent } from '../utils/format';

interface OverviewPageProps {
   datasetId: string;
}

type DetailKind =
   | 'outgoingBooks'
   | 'incomingBooks'
   | 'bookLinks'
   | 'testamentFlow'
   | 'sourceVerses'
   | 'referencedVerses'
   | 'denseChapters';

interface DetailRow {
   label: string;
   value: number;
   meta?: string;
}

interface DetailSection {
   title: string;
   description: string;
   rows: DetailRow[];
}

type OverviewDetails = Record<DetailKind, DetailSection>;

const detailLabels: Record<DetailKind, string> = {
   outgoingBooks: 'Most outgoing books',
   incomingBooks: 'Most referenced books',
   bookLinks: 'Strongest book links',
   testamentFlow: 'Testament flow',
   sourceVerses: 'Source verses',
   referencedVerses: 'Referenced verses',
   denseChapters: 'Dense chapters',
};

export function OverviewPage({ datasetId }: OverviewPageProps): React.ReactElement {
   const [activeDetail, setActiveDetail] = useState<DetailKind | null>(null);
   const [details, setDetails] = useState<OverviewDetails | null>(null);
   const [detailsLoading, setDetailsLoading] = useState(false);
   const [detailsError, setDetailsError] = useState<Error | null>(null);
   const { data, error, showLoading } = useAsyncData(
      async () => {
         const [ manifest, summary ] = await Promise.all([ loadManifest(datasetId), loadStatsSummary(datasetId) ]);

         return { manifest, summary };
      },
      [ datasetId ],
   );

   useEffect(() => {
      setActiveDetail(null);
      setDetails(null);
      setDetailsError(null);
      setDetailsLoading(false);
   }, [ datasetId ]);

   useEffect(() => {
      if (!activeDetail || details || detailsLoading) {
         return;
      }

      let cancelled = false;
      setDetailsLoading(true);
      setDetailsError(null);

      void loadOverviewDetails(datasetId)
         .then((nextDetails) => {
            if (!cancelled) {
               setDetails(nextDetails);
            }
         })
         .catch((nextError: unknown) => {
            if (!cancelled) {
               setDetailsError(nextError instanceof Error ? nextError : new Error(String(nextError)));
            }
         })
         .finally(() => {
            if (!cancelled) {
               setDetailsLoading(false);
            }
         });

      return () => {
         cancelled = true;
      };
   }, [ activeDetail, datasetId, details, detailsLoading ]);

   if (error) {
      return <ErrorState title="Generated data is unavailable" error={error} />;
   }

   if (!data || showLoading) {
      return <LoadingShimmer rows={6} />;
   }

   const { manifest, summary } = data;
   const testamentEntries = Object.entries(summary.crossTestamentBreakdown);
   const activeSection = activeDetail && details ? details[activeDetail] : null;

   return (
      <div className="page-stack">
         <PageHeader
            eyebrow={`${manifest.publicationSymbol} dataset`}
            title="Bible reference overview"
            description="A generated graph of direct cross references and Study Bible note references, precomputed for static browsing."
         />

         <section className="stat-grid" aria-label="Summary statistics">
            <StatCard
               label="Combined references"
               value={summary.totalCombinedReferences}
               detail={`${formatNumber(summary.distinctBookToBookLinks)} book links`}
               icon={<GitBranch size={20} />}
            />
            <StatCard
               label="Direct cross references"
               value={summary.totalCrossReferences}
               detail={formatPercent(summary.totalCrossReferences, summary.totalCombinedReferences)}
               icon={<BookMarked size={20} />}
            />
            <StatCard
               label="Study-note references"
               value={summary.totalStudyNoteReferences}
               detail={formatPercent(summary.totalStudyNoteReferences, summary.totalCombinedReferences)}
               icon={<Landmark size={20} />}
            />
            <StatCard
               label="Mapped verses"
               value={summary.extraction.mappedVerses}
               detail={`${formatNumber(summary.distinctSourceVerses)} source verses`}
               icon={<Blocks size={20} />}
            />
         </section>

         <section className="overview-grid">
            <article className="panel">
               <PanelTitle
                  icon={<ArrowUpFromLine size={20} />}
                  title="Most outgoing books"
                  description="Books whose verses point to the most references in this dataset."
                  detailKind="outgoingBooks"
                  onOpen={setActiveDetail}
               />
               <RankList
                  items={summary.topOutgoingBooks.map((item) => [ item.book, item.count ])}
                  onSelect={() => setActiveDetail('outgoingBooks')}
               />
            </article>

            <article className="panel">
               <PanelTitle
                  icon={<ArrowDownToLine size={20} />}
                  title="Most referenced books"
                  description="Books that receive the most links from other verses."
                  detailKind="incomingBooks"
                  onOpen={setActiveDetail}
               />
               <RankList
                  items={summary.topIncomingBooks.map((item) => [ item.book, item.count ])}
                  onSelect={() => setActiveDetail('incomingBooks')}
               />
            </article>

            <article className="panel">
               <PanelTitle
                  icon={<GitBranch size={20} />}
                  title="Strongest book links"
                  description="The heaviest source-book to target-book connections."
                  detailKind="bookLinks"
                  onOpen={setActiveDetail}
               />
               <RankList
                  items={summary.strongestBookLinks.slice(0, 8).map((item) => [
                     `${item.sourceBook} to ${item.targetBook}`,
                     item.weight,
                  ])}
                  onSelect={() => setActiveDetail('bookLinks')}
               />
            </article>

            <article className="panel">
               <PanelTitle
                  icon={<Blocks size={20} />}
                  title="Testament flow"
                  description="How links move within and between the Hebrew-Aramaic and Greek Scriptures."
                  detailKind="testamentFlow"
                  onOpen={setActiveDetail}
               />
               <div className="flow-list">
                  {testamentEntries.map(([ label, value ]) => (
                     <button key={label} type="button" onClick={() => setActiveDetail('testamentFlow')}>
                        <span>{label}</span>
                        <strong>{formatNumber(value)}</strong>
                        <meter min={0} max={summary.totalCombinedReferences} value={value} />
                     </button>
                  ))}
               </div>
            </article>
         </section>

         <section className="wide-panel">
            <div className="panel-heading">
               <BookMarked size={20} />
               <div>
                  <h2>High-density verses and chapters</h2>
                  <p>Verses and chapters with unusually many incoming or outgoing graph connections.</p>
               </div>
            </div>
            <div className="triple-list">
               <RankColumn
                  title="Source verses"
                  detailKind="sourceVerses"
                  items={summary.topSourceVerses.slice(0, 6).map((item) => [ item.label, item.count ])}
                  onOpen={setActiveDetail}
               />
               <RankColumn
                  title="Referenced verses"
                  detailKind="referencedVerses"
                  items={summary.topReferencedVerses.slice(0, 6).map((item) => [ item.label, item.count ])}
                  onOpen={setActiveDetail}
               />
               <RankColumn
                  title="Dense chapters"
                  detailKind="denseChapters"
                  items={summary.topDenseChapters.slice(0, 6).map((item) => [ item.label, item.count ])}
                  onOpen={setActiveDetail}
               />
            </div>
         </section>

         {activeDetail ? (
            <DetailModal
               title={activeSection?.title ?? detailLabels[activeDetail]}
               description={activeSection?.description ?? 'Loading complete list.'}
               rows={activeSection?.rows ?? []}
               loading={detailsLoading}
               error={detailsError}
               onClose={() => setActiveDetail(null)}
            />
         ) : null}
      </div>
   );
}

interface PanelTitleProps {
   icon: React.ReactNode;
   title: string;
   description: string;
   detailKind: DetailKind;
   onOpen: (detailKind: DetailKind) => void;
}

function PanelTitle({ icon, title, description, detailKind, onOpen }: PanelTitleProps): React.ReactElement {
   return (
      <div className="panel-heading with-action">
         {icon}
         <div>
            <h2>{title}</h2>
            <p>{description}</p>
         </div>
         <button className="text-button" type="button" onClick={() => onOpen(detailKind)}>
            View all
         </button>
      </div>
   );
}

interface RankListProps {
   items: Array<[ string, number ]>;
   onSelect?: () => void;
}

function RankList({ items, onSelect }: RankListProps): React.ReactElement {
   const maximum = Math.max(...items.map((item) => item[1]), 1);

   return (
      <ol className="rank-list">
         {items.map(([ label, value ]) => (
            <li key={label}>
               {onSelect ? (
                  <button type="button" onClick={onSelect}>
                     <span>{label}</span>
                     <strong>{formatNumber(value)}</strong>
                     <meter min={0} max={maximum} value={value} />
                  </button>
               ) : (
                  <>
                     <span>{label}</span>
                     <strong>{formatNumber(value)}</strong>
                     <meter min={0} max={maximum} value={value} />
                  </>
               )}
            </li>
         ))}
      </ol>
   );
}

interface RankColumnProps extends RankListProps {
   title: string;
   detailKind: DetailKind;
   onOpen: (detailKind: DetailKind) => void;
}

function RankColumn({ title, detailKind, items, onOpen }: RankColumnProps): React.ReactElement {
   return (
      <div>
         <div className="column-heading">
            <h3>{title}</h3>
            <button className="text-button compact" type="button" onClick={() => onOpen(detailKind)}>
               View all
            </button>
         </div>
         <RankList items={items} onSelect={() => onOpen(detailKind)} />
      </div>
   );
}

interface DetailModalProps {
   title: string;
   description: string;
   rows: DetailRow[];
   loading: boolean;
   error: Error | null;
   onClose: () => void;
}

function DetailModal({ title, description, rows, loading, error, onClose }: DetailModalProps): React.ReactElement {
   const maximum = Math.max(...rows.map((row) => row.value), 1);

   return (
      <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
         <section
            className="detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="overview-detail-title"
            onMouseDown={(event) => event.stopPropagation()}
         >
            <header>
               <div>
                  <h2 id="overview-detail-title">{title}</h2>
                  <p>{description}</p>
               </div>
               <button className="icon-button compact" type="button" onClick={onClose} title="Close">
                  <X size={16} />
               </button>
            </header>
            {error ? <ErrorState title="Complete list is unavailable" error={error} /> : null}
            {loading ? <LoadingShimmer rows={5} /> : null}
            {!loading && !error ? (
               <ol className="detail-row-list">
                  {rows.map((row) => (
                     <li key={`${row.label}-${row.meta ?? ''}`}>
                        <div>
                           <span>{row.label}</span>
                           {row.meta ? <small>{row.meta}</small> : null}
                        </div>
                        <strong>{formatNumber(row.value)}</strong>
                        <meter min={0} max={maximum} value={row.value} />
                     </li>
                  ))}
               </ol>
            ) : null}
         </section>
      </div>
   );
}

async function loadOverviewDetails(datasetId: string): Promise<OverviewDetails> {
   const [ books, matrix, edges, verseIndex ] = await Promise.all([
      loadBooks(datasetId),
      loadBookMatrix(datasetId, 'combined'),
      loadCompactEdges(datasetId, 'combined'),
      loadVerseIndex(datasetId),
   ]);

   return buildOverviewDetails(books, matrix, edges, verseIndex);
}

export function buildOverviewDetails(
   books: Book[],
   matrix: BookMatrix,
   edges: CompactEdges,
   verseIndex: VerseIndex,
): OverviewDetails {
   const bookByNumber = new Map(books.map((book) => [ book.bookNumber, book ]));
   const verseCounts = countVerseConnections(edges, verseIndex);
   const chapterTotals = new Map<string, DetailRow>();

   for (const verse of Object.values(verseIndex)) {
      const outgoing = verseCounts.source.get(verse.jwpubVerseId) ?? 0;
      const incoming = verseCounts.target.get(verse.jwpubVerseId) ?? 0;
      const count = outgoing + incoming;

      if (count === 0) {
         continue;
      }

      const key = `${verse.bookNumber}-${verse.chapterNumber}`;
      const existing = chapterTotals.get(key);

      if (existing) {
         existing.value += count;
      } else {
         chapterTotals.set(key, {
            label: chapterLabel(verse, bookByNumber),
            value: count,
         });
      }
   }

   return {
      outgoingBooks: {
         title: 'Most outgoing books',
         description: 'Every book sorted by how many references originate from its verses.',
         rows: books
            .map((book, index) => ({
               label: book.name,
               value: matrix[index]?.reduce((total, weight) => total + weight, 0) ?? 0,
               meta: book.testament === 'OT' ? 'Old Testament' : 'New Testament',
            }))
            .sort(sortRows),
      },
      incomingBooks: {
         title: 'Most referenced books',
         description: 'Every book sorted by how many references point into it.',
         rows: books
            .map((book, index) => ({
               label: book.name,
               value: matrix.reduce((total, row) => total + (row[index] ?? 0), 0),
               meta: book.testament === 'OT' ? 'Old Testament' : 'New Testament',
            }))
            .sort(sortRows),
      },
      bookLinks: {
         title: 'Strongest book links',
         description: 'Every non-empty source-book to target-book connection, sorted by weight.',
         rows: matrix
            .flatMap((row, sourceIndex) =>
               row.map((weight, targetIndex) => ({
                  label: `${books[sourceIndex]?.name ?? `Book ${sourceIndex + 1}`} to ${
                     books[targetIndex]?.name ?? `Book ${targetIndex + 1}`
                  }`,
                  value: weight,
               })),
            )
            .filter((row) => row.value > 0)
            .sort(sortRows),
      },
      testamentFlow: {
         title: 'Testament flow',
         description: 'All generated links grouped by source and target testament.',
         rows: buildTestamentRows(books, matrix),
      },
      sourceVerses: {
         title: 'Source verses',
         description: 'Every verse that points to at least one generated reference.',
         rows: Array.from(verseCounts.source.entries()).map(([ verseId, value ]) => ({
            label: verseIndex[String(verseId)]?.label ?? `Verse ${verseId}`,
            value,
            meta: bookByNumber.get(verseIndex[String(verseId)]?.bookNumber ?? 0)?.name,
         })).sort(sortRows),
      },
      referencedVerses: {
         title: 'Referenced verses',
         description: 'Every verse that receives at least one generated reference.',
         rows: Array.from(verseCounts.target.entries()).map(([ verseId, value ]) => ({
            label: verseIndex[String(verseId)]?.label ?? `Verse ${verseId}`,
            value,
            meta: bookByNumber.get(verseIndex[String(verseId)]?.bookNumber ?? 0)?.name,
         })).sort(sortRows),
      },
      denseChapters: {
         title: 'Dense chapters',
         description: 'Every chapter with incoming or outgoing reference activity, sorted by total activity.',
         rows: Array.from(chapterTotals.values()).sort(sortRows),
      },
   };
}

function countVerseConnections(edges: CompactEdges, verseIndex: VerseIndex): {
   source: Map<number, number>;
   target: Map<number, number>;
} {
   const source = new Map<number, number>();
   const target = new Map<number, number>();

   for (let index = 0; index < edges.source.length; index += 1) {
      const sourceVerseId = edges.source[index];
      source.set(sourceVerseId, (source.get(sourceVerseId) ?? 0) + 1);

      for (let targetVerseId = edges.targetStart[index]; targetVerseId <= edges.targetEnd[index]; targetVerseId += 1) {
         if (verseIndex[String(targetVerseId)]) {
            target.set(targetVerseId, (target.get(targetVerseId) ?? 0) + 1);
         }
      }
   }

   return { source, target };
}

function buildTestamentRows(books: Book[], matrix: BookMatrix): DetailRow[] {
   const totals = new Map<string, number>();

   for (let sourceIndex = 0; sourceIndex < matrix.length; sourceIndex += 1) {
      for (let targetIndex = 0; targetIndex < matrix[sourceIndex].length; targetIndex += 1) {
         const sourceTestament = books[sourceIndex]?.testament ?? 'OT';
         const targetTestament = books[targetIndex]?.testament ?? 'OT';
         const key = `${sourceTestament}->${targetTestament}`;

         totals.set(key, (totals.get(key) ?? 0) + matrix[sourceIndex][targetIndex]);
      }
   }

   return Array.from(totals.entries())
      .map(([ label, value ]) => ({ label, value }))
      .sort(sortRows);
}

function chapterLabel(verse: VerseRef, bookByNumber: Map<number, Book>): string {
   return `${bookByNumber.get(verse.bookNumber)?.name ?? `Book ${verse.bookNumber}`} ${verse.chapterNumber}`;
}

function sortRows(left: DetailRow, right: DetailRow): number {
   return right.value - left.value || left.label.localeCompare(right.label);
}
