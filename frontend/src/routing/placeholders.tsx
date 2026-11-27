/**
 * Interim pages for routes whose real pages are being built in parallel (E-D).
 * Each is swapped out by editing one line in `pageRegistry.tsx`; delete this file once all are.
 */
import { Library } from 'lucide-react';
import { lazy, Suspense } from 'react';

import { LoadingShimmer } from '../components/LoadingShimmer';
import { PageHeader } from '../components/PageHeader';
import { EmptyState, Tabs } from '../components/ui';
import { useT } from '../i18n';
import { AppLink } from './AppLink';
import { bookByNumber } from './bookSlugs';
import type { BookPageProps, InsightsPageProps } from './pageRegistry';
import { insightsHref, navigate, verseHref } from './routes';

const legacyLoaders = {
   overview: () => import('../pages/OverviewPage').then((m) => ({ default: m.OverviewPage })),
   chord: () => import('../pages/ChordPage').then((m) => ({ default: m.ChordPage })),
   clusters: () => import('../pages/RelationshipBlocksPage').then((m) => ({ default: m.RelationshipBlocksPage })),
};

const LegacyOverview = lazy(legacyLoaders.overview);
const LegacyChord = lazy(legacyLoaders.chord);
const LegacyClusters = lazy(legacyLoaders.clusters);

type InsightsTab = 'overview' | 'chord' | 'clusters';

/** Interim Insights (E-D replaces): the Sprint 1 analytics pages behind tabs. */
export function InsightsPlaceholder({ datasetId, tab, params }: InsightsPageProps): React.ReactElement {
   const t = useT();
   const active: InsightsTab = tab === 'chord' || tab === 'clusters' ? tab : 'overview';

   return (
      <div className="page-stack">
         <Tabs<InsightsTab>
            label={t('home.placeholder.insightsTabs')}
            value={active}
            variant="pill"
            onChange={(next) => navigate(insightsHref(next === 'overview' ? undefined : next, params), { replace: true })}
            items={[
               { value: 'overview', label: t('home.placeholder.tabOverview') },
               { value: 'chord', label: t('home.placeholder.tabBooks') },
               { value: 'clusters', label: t('home.placeholder.tabClusters') },
            ]}
         />
         <Suspense fallback={<LoadingShimmer rows={5} />}>
            {active === 'chord' ? (
               <LegacyChord datasetId={datasetId} />
            ) : active === 'clusters' ? (
               <LegacyClusters datasetId={datasetId} />
            ) : (
               <LegacyOverview datasetId={datasetId} />
            )}
         </Suspense>
      </div>
   );
}

function ComingSoon({
   eyebrow,
   title,
   icon,
   action,
}: {
   eyebrow: string;
   title: string;
   icon: React.ReactNode;
   action?: React.ReactNode;
}): React.ReactElement {
   const t = useT();

   return (
      <div className="page-stack">
         <PageHeader eyebrow={eyebrow} title={title} description={t('home.placeholder.description')} />
         <EmptyState size="page" icon={icon} title={t('home.placeholder.title')} description={t('home.placeholder.body')} action={action} />
      </div>
   );
}

/** Interim book profile (E-D replaces). */
export function BookPlaceholder({ book, params }: BookPageProps): React.ReactElement {
   const t = useT();
   const name = bookByNumber(book)?.nameEn ?? '';

   return (
      <ComingSoon
         eyebrow={t('home.placeholder.bookEyebrow')}
         title={name}
         icon={<Library size={22} />}
         action={
            <AppLink className="ui-button ui-button--primary ui-button--md" href={verseHref({ bookNumber: book, chapterNumber: 1, verseNumber: 1 }, params)}>
               {t('home.placeholder.studyFirstVerse', { ref: `${name} 1:1` })}
            </AppLink>
         }
      />
   );
}
