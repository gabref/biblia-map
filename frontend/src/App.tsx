import { BarChart3, BookOpen, CircleHelp, GitBranch, Network } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { DatasetBadge } from './components/DatasetBadge';
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
   const activeRoute = useMemo(() => routeFromPath(path), [ path ]);

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

            <DatasetBadge />
         </aside>

         <main className="main-surface">{renderRoute(activeRoute)}</main>
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

function renderRoute(route: RouteId): React.ReactNode {
   switch (route) {
      case 'chord':
         return <ChordPage />;
      case 'verse':
         return <VersePage />;
      case 'about':
         return <AboutPage />;
      case 'overview':
      default:
         return <OverviewPage />;
   }
}
