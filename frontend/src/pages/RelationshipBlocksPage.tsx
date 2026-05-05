import { Blocks, CircleDot, GitBranch, Network } from 'lucide-react';

import { ErrorState } from '../components/ErrorState';
import { LoadingShimmer } from '../components/LoadingShimmer';
import { PageHeader } from '../components/PageHeader';
import { StatCard } from '../components/StatCard';
import { loadBooks, loadCompactEdges, loadManifest, loadVerseIndex } from '../data/generated';
import { buildRelationshipComponents, type RelationshipComponent } from '../graph/relationshipComponents';
import { useAsyncData } from '../hooks/useAsyncData';
import { formatNumber, formatPercent } from '../utils/format';

interface RelationshipBlocksPageProps {
   datasetId: string;
}

export function RelationshipBlocksPage({ datasetId }: RelationshipBlocksPageProps): React.ReactElement {
   const { data, error, showLoading } = useAsyncData(
      async () => {
         const [ manifest, books, verseIndex, edges ] = await Promise.all([
            loadManifest(datasetId),
            loadBooks(datasetId),
            loadVerseIndex(datasetId),
            loadCompactEdges(datasetId, 'combined'),
         ]);

         return {
            manifest,
            summary: buildRelationshipComponents(verseIndex, edges, books),
         };
      },
      [ datasetId ],
   );

   if (error) {
      return <ErrorState title="Relationship blocks are unavailable" error={error} />;
   }

   if (!data || showLoading) {
      return <LoadingShimmer rows={7} />;
   }

   const { manifest, summary } = data;
   const largest = summary.largestBlock;
   const topComponents = summary.components.slice(0, 14);

   return (
      <div className="page-stack">
         <PageHeader
            eyebrow={`${manifest.publicationSymbol} connected graph`}
            title="Reference blocks"
            description="An undirected scan of every generated cross reference and study-note reference, grouped by verses that can reach each other through any chain of references."
         />

         <section className="stat-grid" aria-label="Relationship block statistics">
            <StatCard label="Reference blocks" value={summary.blockCount} detail="Disconnected graph groups" icon={<Blocks size={20} />} />
            <StatCard
               label="Largest block"
               value={largest?.size ?? 0}
               detail={largest ? formatPercent(largest.size, summary.totalVerses) : 'No verses'}
               icon={<Network size={20} />}
            />
            <StatCard
               label="Isolated verses"
               value={summary.isolatedVerses}
               detail={formatPercent(summary.isolatedVerses, summary.totalVerses)}
               icon={<CircleDot size={20} />}
            />
            <StatCard
               label="Scanned links"
               value={summary.totalEdges}
               detail={`${formatNumber(summary.totalVerses)} verses`}
               icon={<GitBranch size={20} />}
            />
         </section>

         <section className="blocks-layout">
            <article className="graph-frame blocks-visual">
               <div className="graph-toolbar">
                  <span>
                     <Network size={17} />
                     {summary.blockCount === 1 ? 'One connected reference graph' : `${formatNumber(summary.blockCount)} separate blocks`}
                  </span>
                  <strong>{largest ? `${formatPercent(largest.size, summary.totalVerses)} in largest block` : 'No graph'}</strong>
               </div>
               <div className="component-bars" aria-label="Largest reference blocks">
                  {topComponents.map((component) => (
                     <BlockBar key={component.id} component={component} totalVerses={summary.totalVerses} />
                  ))}
               </div>
            </article>

            <aside className="side-panel">
               <div className="panel-heading">
                  <Blocks size={20} />
                  <div>
                     <h2>What the scan found</h2>
                     <p>
                        {summary.blockCount === 1
                           ? 'Every mapped verse belongs to the same connected reference block.'
                           : 'Some references form separate blocks that never touch the largest graph.'}
                     </p>
                  </div>
               </div>
               <dl className="metadata-list">
                  <div>
                     <dt>Total verses</dt>
                     <dd>{formatNumber(summary.totalVerses)}</dd>
                  </div>
                  <div>
                     <dt>Separate blocks</dt>
                     <dd>{formatNumber(summary.blockCount)}</dd>
                  </div>
                  <div>
                     <dt>Largest coverage</dt>
                     <dd>{largest ? formatPercent(largest.size, summary.totalVerses) : '0%'}</dd>
                  </div>
                  <div>
                     <dt>One-verse blocks</dt>
                     <dd>{formatNumber(summary.isolatedVerses)}</dd>
                  </div>
               </dl>
            </aside>
         </section>

         <section className="wide-panel">
            <div className="panel-heading">
               <GitBranch size={20} />
               <div>
                  <h2>Largest blocks</h2>
                  <p>Sorted from most verses to least, with sample verses and the books most represented inside each block.</p>
               </div>
            </div>
            <div className="block-list">
               {summary.components.slice(0, 18).map((component) => (
                  <article key={component.id} className="block-row">
                     <div>
                        <strong>Block {component.id}</strong>
                        <span>
                           {formatNumber(component.size)} verses, {formatNumber(component.edgeCount)} links
                        </span>
                     </div>
                     <meter min={0} max={summary.totalVerses} value={component.size} />
                     <p>{component.sampleVerses.join(', ')}</p>
                     <div className="book-chip-list">
                        {component.topBooks.map((book) => (
                           <span key={book.bookNumber}>
                              {book.name} <strong>{formatNumber(book.count)}</strong>
                           </span>
                        ))}
                     </div>
                  </article>
               ))}
            </div>
         </section>
      </div>
   );
}

interface BlockBarProps {
   component: RelationshipComponent;
   totalVerses: number;
}

function BlockBar({ component, totalVerses }: BlockBarProps): React.ReactElement {
   const width = `${Math.max(2, component.percent * 100)}%`;

   return (
      <div className="component-bar">
         <div>
            <strong>Block {component.id}</strong>
            <span>
               {formatNumber(component.size)} verses, {formatPercent(component.size, totalVerses)}
            </span>
         </div>
         <i style={{ width }} />
      </div>
   );
}
