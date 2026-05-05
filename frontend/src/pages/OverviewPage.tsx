import { ArrowDownToLine, ArrowUpFromLine, BookMarked, Blocks, GitBranch, Landmark } from 'lucide-react';

import { ErrorState } from '../components/ErrorState';
import { LoadingShimmer } from '../components/LoadingShimmer';
import { PageHeader } from '../components/PageHeader';
import { StatCard } from '../components/StatCard';
import { loadManifest, loadStatsSummary } from '../data/generated';
import { useAsyncData } from '../hooks/useAsyncData';
import { formatNumber, formatPercent } from '../utils/format';

export function OverviewPage(): React.ReactElement {
   const { data, error, showLoading } = useAsyncData(
      async () => {
         const [ manifest, summary ] = await Promise.all([ loadManifest(), loadStatsSummary() ]);

         return { manifest, summary };
      },
      [],
   );

   if (error) {
      return <ErrorState title="Generated data is unavailable" error={error} />;
   }

   if (!data || showLoading) {
      return <LoadingShimmer rows={6} />;
   }

   const { manifest, summary } = data;
   const testamentEntries = Object.entries(summary.crossTestamentBreakdown);

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
               <div className="panel-heading">
                  <ArrowUpFromLine size={20} />
                  <h2>Most outgoing books</h2>
               </div>
               <RankList items={summary.topOutgoingBooks.map((item) => [ item.book, item.count ])} />
            </article>

            <article className="panel">
               <div className="panel-heading">
                  <ArrowDownToLine size={20} />
                  <h2>Most referenced books</h2>
               </div>
               <RankList items={summary.topIncomingBooks.map((item) => [ item.book, item.count ])} />
            </article>

            <article className="panel">
               <div className="panel-heading">
                  <GitBranch size={20} />
                  <h2>Strongest book links</h2>
               </div>
               <RankList
                  items={summary.strongestBookLinks.slice(0, 8).map((item) => [
                     `${item.sourceBook} to ${item.targetBook}`,
                     item.weight,
                  ])}
               />
            </article>

            <article className="panel">
               <div className="panel-heading">
                  <Blocks size={20} />
                  <h2>Testament flow</h2>
               </div>
               <div className="flow-list">
                  {testamentEntries.map(([ label, value ]) => (
                     <div key={label}>
                        <span>{label}</span>
                        <strong>{formatNumber(value)}</strong>
                        <meter min={0} max={summary.totalCombinedReferences} value={value} />
                     </div>
                  ))}
               </div>
            </article>
         </section>

         <section className="wide-panel">
            <div className="panel-heading">
               <BookMarked size={20} />
               <h2>High-density verses and chapters</h2>
            </div>
            <div className="triple-list">
               <RankColumn
                  title="Source verses"
                  items={summary.topSourceVerses.slice(0, 6).map((item) => [ item.label, item.count ])}
               />
               <RankColumn
                  title="Referenced verses"
                  items={summary.topReferencedVerses.slice(0, 6).map((item) => [ item.label, item.count ])}
               />
               <RankColumn
                  title="Dense chapters"
                  items={summary.topDenseChapters.slice(0, 6).map((item) => [ item.label, item.count ])}
               />
            </div>
         </section>
      </div>
   );
}

interface RankListProps {
   items: Array<[ string, number ]>;
}

function RankList({ items }: RankListProps): React.ReactElement {
   const maximum = Math.max(...items.map((item) => item[1]), 1);

   return (
      <ol className="rank-list">
         {items.map(([ label, value ]) => (
            <li key={label}>
               <span>{label}</span>
               <strong>{formatNumber(value)}</strong>
               <meter min={0} max={maximum} value={value} />
            </li>
         ))}
      </ol>
   );
}

interface RankColumnProps extends RankListProps {
   title: string;
}

function RankColumn({ title, items }: RankColumnProps): React.ReactElement {
   return (
      <div>
         <h3>{title}</h3>
         <RankList items={items} />
      </div>
   );
}
