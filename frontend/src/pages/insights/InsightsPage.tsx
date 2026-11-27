import { BarChart3, Boxes, Flame, GitCompareArrows, Grid3x3, Network } from 'lucide-react';
import { lazy, Suspense } from 'react';

import { TabPanel, Tabs, type TabItem } from '../../components/ui';
import { loadBooks, loadManifest } from '../../data/generated';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useT } from '../../i18n';
import { navigate } from '../../routing/routes';
import type { Book, EdgeKindFilter } from '../../types/generated';
import './insights.css';
import { OverviewPanel } from './OverviewPanel';
import {
   PanelError,
   PanelSkeleton,
   insightsUrl,
   useInsightsLocation,
   type InsightsLocation,
   type InsightsTab,
} from './shared';

export interface InsightsPageProps {
   datasetId: string;
}

/** What every Insights panel receives. */
export interface InsightsPanelProps {
   datasetId: string;
   books: Book[];
   /** Effective reference type (always `combined` for editions without study notes). */
   kind: EdgeKindFilter;
   hasStudyNotes: boolean;
   location: InsightsLocation;
}

const TAB_IDS = 'insights';

// One chunk per tab: the chord (d3) and the other visualisations load only when opened.
const ChordPanel = lazy(() => import('./ChordPanel').then((module) => ({ default: module.ChordPanel })));
const HubVerses = lazy(() => import('./HubVerses').then((module) => ({ default: module.HubVerses })));
const ChapterHeatmap = lazy(() => import('./ChapterHeatmap').then((module) => ({ default: module.ChapterHeatmap })));
const QuotationFlows = lazy(() => import('./QuotationFlows').then((module) => ({ default: module.QuotationFlows })));
const ClustersPanel = lazy(() => import('./ClustersPanel').then((module) => ({ default: module.ClustersPanel })));

/**
 * Insights: the analytics of the reference graph as study entry points. The tab, the reference
 * type and any selection live in the URL (`/insights?tab=hubs&kind=crossrefs`).
 */
export function InsightsPage({ datasetId }: InsightsPageProps): React.ReactElement {
   const t = useT();
   const location = useInsightsLocation();
   const { data, error, showLoading } = useAsyncData(
      async () => {
         const [ manifest, books ] = await Promise.all([ loadManifest(datasetId), loadBooks(datasetId) ]);

         return { manifest, books };
      },
      [ datasetId ],
   );
   const hasStudyNotes = data?.manifest.availableEdgeKinds.includes('study_note_reference') ?? false;
   const kind: EdgeKindFilter = hasStudyNotes ? location.kind : 'combined';
   const tabs: TabItem<InsightsTab>[] = [
      { value: 'overview', label: t('insights.tab.overview'), icon: <BarChart3 size={15} aria-hidden="true" /> },
      { value: 'chord', label: t('insights.tab.chord'), icon: <Network size={15} aria-hidden="true" /> },
      { value: 'hubs', label: t('insights.tab.hubs'), icon: <Flame size={15} aria-hidden="true" /> },
      { value: 'heatmap', label: t('insights.tab.heatmap'), icon: <Grid3x3 size={15} aria-hidden="true" /> },
      { value: 'flows', label: t('insights.tab.flows'), icon: <GitCompareArrows size={15} aria-hidden="true" /> },
      { value: 'clusters', label: t('insights.tab.clusters'), icon: <Boxes size={15} aria-hidden="true" /> },
   ];
   const kindTabs: TabItem<EdgeKindFilter>[] = [
      { value: 'combined', label: t('insights.kind.combined') },
      { value: 'crossrefs', label: t('insights.kind.crossrefs') },
      { value: 'study-notes', label: t('insights.kind.studyNotes') },
   ];
   const panelProps: InsightsPanelProps | null = data
      ? { datasetId, books: data.books, kind, hasStudyNotes, location: { ...location, kind } }
      : null;

   return (
      <div className="page-stack ins-page">
         <header className="page-header ins-header">
            <div>
               <p className="eyebrow">
                  {data ? t('insights.eyebrow', { edition: data.manifest.publicationSymbol }) : t('insights.title')}
               </p>
               <h1>{t('insights.title')}</h1>
               <p className="page-description">{t('insights.description')}</p>
            </div>
            {hasStudyNotes ? (
               <div className="page-header-actions ins-header__filter">
                  <span className="t-caption" id="insights-kind-label">
                     {t('insights.kind.label')}
                  </span>
                  <Tabs
                     label={t('insights.kind.label')}
                     variant="pill"
                     size="sm"
                     items={kindTabs}
                     value={kind}
                     onChange={(next) =>
                        navigate(insightsUrl({ ...location, kind: next }), { replace: true })}
                  />
               </div>
            ) : null}
         </header>

         <Tabs
            label={t('insights.tabs.label')}
            idBase={TAB_IDS}
            items={tabs}
            value={location.tab}
            className="ins-tabs"
            onChange={(tab) => navigate(insightsUrl({ tab, kind, carry: location.carry }))}
         />

         {error ? <PanelError error={error} /> : null}
         {!error && (!panelProps || showLoading) ? <PanelSkeleton rows={8} /> : null}
         {panelProps && !error ? (
            <Suspense fallback={<PanelSkeleton rows={8} />}>
               <TabPanel idBase={TAB_IDS} value="overview" activeValue={location.tab} className="ins-panel" tabIndex={-1}>
                  <OverviewPanel {...panelProps} />
               </TabPanel>
               <TabPanel idBase={TAB_IDS} value="chord" activeValue={location.tab} className="ins-panel" tabIndex={-1}>
                  <ChordPanel {...panelProps} />
               </TabPanel>
               <TabPanel idBase={TAB_IDS} value="hubs" activeValue={location.tab} className="ins-panel" tabIndex={-1}>
                  <HubVerses {...panelProps} />
               </TabPanel>
               <TabPanel idBase={TAB_IDS} value="heatmap" activeValue={location.tab} className="ins-panel" tabIndex={-1}>
                  <ChapterHeatmap {...panelProps} />
               </TabPanel>
               <TabPanel idBase={TAB_IDS} value="flows" activeValue={location.tab} className="ins-panel" tabIndex={-1}>
                  <QuotationFlows {...panelProps} />
               </TabPanel>
               <TabPanel idBase={TAB_IDS} value="clusters" activeValue={location.tab} className="ins-panel" tabIndex={-1}>
                  <ClustersPanel {...panelProps} />
               </TabPanel>
            </Suspense>
         ) : null}
      </div>
   );
}
