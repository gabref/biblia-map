import { BarChart3, BookOpen, CircleHelp, GitBranch, Network } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { DatasetBadge } from './components/DatasetBadge';
import { ErrorState } from './components/ErrorState';
import { LoadingShimmer } from './components/LoadingShimmer';
import { loadDatasets } from './data/generated';
import { useAsyncData } from './hooks/useAsyncData';
import { AboutPage } from './pages/AboutPage';
import { ChordPage } from './pages/ChordPage';
import { OverviewPage } from './pages/OverviewPage';
import { VersePage } from './pages/VersePage';

type RouteId = 'overview' | 'chord' | 'verse' | 'about';

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
   { id: 'about', href: '/about', label: 'About', icon: <CircleHelp size={18} /> },
];

export function App(): React.ReactElement {
   const [path, setPath] = useState(window.location.pathname);
   const [selectedDatasetId, setSelectedDatasetId] = useState(
      window.localStorage.getItem('bibliamap-dataset') ?? 'nwtsty',
   );
   const datasetsState = useAsyncData(loadDatasets, []);
   const activeRoute = useMemo(() => routeFromPath(path), [ path ]);
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

   const navigate = (event: React.MouseEvent<HTMLAnchorElement>, href: string): void => {
      event.preventDefault();
      window.history.pushState({}, '', href);
      setPath(href);
      window.scrollTo({ top: 0, behavior: 'smooth' });
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
         <aside className="sidebar" aria-label="Primary navigation">
            <a href="/" className="brand" onClick={(event) => navigate(event, '/')}>
               <span className="brand-mark">
                  <BookOpen size={22} />
               </span>
               <span>
                  <span className="brand-title">BibliaMap</span>
                  <span className="brand-subtitle">Reference graph</span>
               </span>
            </a>

            <nav className="nav-list">
               {routes.map((route) => (
                  <a
                     key={route.id}
                     href={route.href}
                     className={route.id === activeRoute ? 'nav-link active' : 'nav-link'}
                     onClick={(event) => navigate(event, route.href)}
                  >
                     {route.icon}
                     <span>{route.label}</span>
                  </a>
               ))}
            </nav>

            <DatasetBadge
               datasets={datasets}
               selectedDatasetId={selectedDataset.datasetId}
               onChange={handleDatasetChange}
            />
         </aside>

         <main className="main-surface">{renderRoute(activeRoute, selectedDataset.datasetId)}</main>
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

   if (path.startsWith('/about')) {
      return 'about';
   }

   return 'overview';
}

function renderRoute(route: RouteId, datasetId: string): React.ReactNode {
   switch (route) {
      case 'chord':
         return <ChordPage datasetId={datasetId} />;
      case 'verse':
         return <VersePage datasetId={datasetId} />;
      case 'about':
         return <AboutPage datasetId={datasetId} />;
      case 'overview':
      default:
         return <OverviewPage datasetId={datasetId} />;
   }
}
