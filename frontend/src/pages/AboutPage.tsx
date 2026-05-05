import { Database, FileJson2, ShieldCheck } from 'lucide-react';

import { ErrorState } from '../components/ErrorState';
import { LoadingShimmer } from '../components/LoadingShimmer';
import { PageHeader } from '../components/PageHeader';
import { loadManifest, loadStatsSummary } from '../data/generated';
import { useAsyncData } from '../hooks/useAsyncData';
import { formatNumber } from '../utils/format';

export function AboutPage(): React.ReactElement {
   const { data, error, showLoading } = useAsyncData(
      async () => {
         const [ manifest, summary ] = await Promise.all([ loadManifest(), loadStatsSummary() ]);

         return { manifest, summary };
      },
      [],
   );

   if (error) {
      return <ErrorState title="Methodology data is unavailable" error={error} />;
   }

   if (!data || showLoading) {
      return <LoadingShimmer rows={5} />;
   }

   return (
      <div className="page-stack">
         <PageHeader
            eyebrow="Methodology"
            title="Static graph build"
            description="BibliaMap compiles known JWPub assets into split JSON before deployment. The browser reads generated metadata only."
         />

         <section className="method-grid">
            <article className="panel">
               <div className="panel-heading">
                  <Database size={20} />
                  <h2>Dataset</h2>
               </div>
               <dl className="metadata-list">
                  <div>
                     <dt>Publication</dt>
                     <dd>{data.manifest.publicationTitle}</dd>
                  </div>
                  <div>
                     <dt>Symbol</dt>
                     <dd>{data.manifest.publicationSymbol}</dd>
                  </div>
                  <div>
                     <dt>Year</dt>
                     <dd>{data.manifest.publicationYear ?? 'Unknown'}</dd>
                  </div>
                  <div>
                     <dt>Generated</dt>
                     <dd>{new Date(data.manifest.generatedAt).toLocaleString()}</dd>
                  </div>
               </dl>
            </article>

            <article className="panel">
               <div className="panel-heading">
                  <FileJson2 size={20} />
                  <h2>Generated files</h2>
               </div>
               <p className="muted-copy">
                  The overview uses summary stats. The chord page uses book matrices. The verse page loads one source or
                  target adjacency file by book.
               </p>
               <dl className="metadata-list">
                  <div>
                     <dt>Cross references</dt>
                     <dd>{formatNumber(data.summary.totalCrossReferences)}</dd>
                  </div>
                  <div>
                     <dt>Study notes</dt>
                     <dd>{formatNumber(data.summary.totalStudyNoteReferences)}</dd>
                  </div>
                  <div>
                     <dt>Skipped rows</dt>
                     <dd>
                        {formatNumber(
                           data.summary.extraction.skippedRows.directUnmapped
                              + data.summary.extraction.skippedRows.studyNoteUnmapped,
                        )}
                     </dd>
                  </div>
               </dl>
            </article>

            <article className="panel">
               <div className="panel-heading">
                  <ShieldCheck size={20} />
                  <h2>Content policy</h2>
               </div>
               <p className="muted-copy">
                  This build exports graph structure, labels, matrices, and aggregate statistics. Full verse text is not
                  published unless a future build enables an approved text export.
               </p>
            </article>
         </section>
      </div>
   );
}
