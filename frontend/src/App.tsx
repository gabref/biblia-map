import { ArrowUpRight, BarChart3, Blocks, CircleHelp, GitBranch, Network } from 'lucide-react';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';

import { DatasetBadge } from './components/DatasetBadge';
import { ErrorState } from './components/ErrorState';
import { LoadingShimmer } from './components/LoadingShimmer';
import { ThemeToggle } from './components/ui/ThemeToggle';
import { loadDatasets } from './data/generated';
import { useAsyncData } from './hooks/useAsyncData';
import { useSlidingIndicator } from './hooks/useSlidingIndicator';
import { useTheme } from './hooks/useTheme';
import {
   AboutPage,
   ChordPage,
   OverviewPage,
   preloadRoute,
   RelationshipBlocksPage,
   StyleguidePage,
   VersePage,
} from './pages/lazyPages';

type RouteId = 'overview' | 'chord' | 'verse' | 'blocks' | 'about' | 'styleguide';

interface Route {
   id: RouteId;
   href: string;
   label: string;
   icon: React.ReactNode;
}

const routes: Route[] = [
   { id: 'overview', href: '/', label: 'Overview', icon: <BarChart3 size={18} /> },
   { id: 'chord', href: '/chord', label: 'Book Graph', icon: <Network size={18} /> },
   { id: 'verse', href: '/verse', label: 'Verse Explorer', icon: <GitBranch size={18} /> },
   { id: 'blocks', href: '/blocks', label: 'Blocks', icon: <Blocks size={18} /> },
   { id: 'about', href: '/about', label: 'About', icon: <CircleHelp size={18} /> },
];

export function App(): React.ReactElement {
   const [path, setPath] = useState(window.location.pathname);
   const [selectedDatasetId, setSelectedDatasetId] = useState(
      window.localStorage.getItem('bibliamap-dataset') ?? 'nwtsty',
   );
   const datasetsState = useAsyncData(loadDatasets, []);
   const activeRoute = useMemo(() => routeFromPath(path), [ path ]);
   const theme = useTheme();
   const mainRef = useRef<HTMLElement | null>(null);
   const navRef = useSlidingIndicator<HTMLElement>(activeRoute);
   const datasets = datasetsState.data ?? [];
   const selectedDataset = datasets.find((dataset) => dataset.datasetId === selectedDatasetId) ?? datasets[0] ?? null;

   useEffect(() => {
      if (selectedDataset && selectedDataset.datasetId !== selectedDatasetId) {
         setSelectedDatasetId(selectedDataset.datasetId);
      }
   }, [ selectedDataset, selectedDatasetId ]);

   useEffect(() => {
      const handlePopState = (): void => setPath(window.location.pathname);
      window.addEventListener('popstate', handlePopState);

      return () => window.removeEventListener('popstate', handlePopState);
   }, []);

   useEffect(() => {
      const route = routes.find((candidate) => candidate.id === activeRoute);

      const label = activeRoute === 'styleguide' ? 'Styleguide' : route?.label;

      document.title = label && activeRoute !== 'overview' ? `${label} · BibliaMap` : 'BibliaMap';
   }, [ activeRoute ]);

   const navigate = (event: React.MouseEvent<HTMLAnchorElement>, href: string): void => {
      event.preventDefault();
      window.history.pushState({}, '', href);
      setPath(href);
      // A new page starts at the top, instantly: the route's own entrance animation carries the change.
      window.scrollTo({ top: 0, behavior: 'instant' });
   };

   const handleDatasetChange = (datasetId: string): void => {
      window.localStorage.setItem('bibliamap-dataset', datasetId);
      setSelectedDatasetId(datasetId);
   };

   if (datasetsState.error) {
      return (
         <main className="main-surface">
            <ErrorState title="Dataset registry is unavailable" error={datasetsState.error} />
         </main>
      );
   }

   if (!selectedDataset || datasetsState.showLoading) {
      return (
         <main className="main-surface">
            <LoadingShimmer rows={5} />
         </main>
      );
   }

   return (
      <div className="app-shell">
         <a
            className="skip-link"
            href="#main-content"
            onClick={(event) => {
               event.preventDefault();
               mainRef.current?.focus();
            }}
         >
            Skip to content
         </a>
         <aside className="sidebar" aria-label="Primary navigation">
            <a href="/" className="brand" onClick={(event) => navigate(event, '/')}>
               <span className="brand-mark">
                  <img src="/bibliamap-icon.svg" alt="" />
               </span>
               <span>
                  <span className="brand-title">BibliaMap</span>
                  <span className="brand-subtitle">Scripture cross-references</span>
               </span>
            </a>

            <nav ref={navRef} className="nav-list" aria-label="Pages">
               {routes.map((route) => {
                  const active = route.id === activeRoute;

                  return (
                     <a
                        key={route.id}
                        href={route.href}
                        className={active ? 'nav-link active' : 'nav-link'}
                        aria-current={active ? 'page' : undefined}
                        data-active={active}
                        onClick={(event) => navigate(event, route.href)}
                        onPointerEnter={() => preloadRoute(route.id, selectedDataset.datasetId)}
                        onFocus={() => preloadRoute(route.id, selectedDataset.datasetId)}
                     >
                        {route.icon}
                        <span>{route.label}</span>
                     </a>
                  );
               })}
            </nav>

            <div className="sidebar-footer">
               <div className="sidebar-tools">
                  <DatasetBadge
                     datasets={datasets}
                     selectedDatasetId={selectedDataset.datasetId}
                     onChange={handleDatasetChange}
                  />
                  <ThemeToggle theme={theme} />
               </div>
               <CreditLinks className="sidebar-credit" />
            </div>
         </aside>

         <main ref={mainRef} id="main-content" className="main-surface" tabIndex={-1}>
            <div key={`${activeRoute}:${selectedDataset.datasetId}`} className="route-view">
               <Suspense fallback={<LoadingShimmer rows={6} />}>
                  {renderRoute(activeRoute, selectedDataset.datasetId)}
               </Suspense>
            </div>
         </main>
         <CreditLinks className="mobile-credit" />
      </div>
   );
}

function routeFromPath(path: string): RouteId {
   if (path.startsWith('/chord')) {
      return 'chord';
   }

   if (path.startsWith('/verse')) {
      return 'verse';
   }

   if (path.startsWith('/blocks')) {
      return 'blocks';
   }

   if (path.startsWith('/about')) {
      return 'about';
   }

   if (path.startsWith('/styleguide')) {
      return 'styleguide';
   }

   return 'overview';
}

function renderRoute(route: RouteId, datasetId: string): React.ReactNode {
   switch (route) {
      case 'chord':
         return <ChordPage datasetId={datasetId} />;
      case 'verse':
         return <VersePage datasetId={datasetId} />;
      case 'blocks':
         return <RelationshipBlocksPage datasetId={datasetId} />;
      case 'about':
         return <AboutPage datasetId={datasetId} />;
      case 'styleguide':
         return <StyleguidePage />;
      case 'overview':
      default:
         return <OverviewPage datasetId={datasetId} />;
   }
}

function CreditLinks({ className }: { className: string }): React.ReactElement {
   return (
      <p className={className}>
         <span>
            Built by{' '}
            <a href="https://gabudev.cloud/" target="_blank" rel="noreferrer">
               gabudev.cloud
            </a>
         </span>
         <a href="https://github.com/gabref/biblia-map" target="_blank" rel="noreferrer">
            Source on GitHub
            <ArrowUpRight size={13} aria-hidden="true" />
         </a>
      </p>
   );
}
