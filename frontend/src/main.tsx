import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { ToastProvider } from './components/ui/Toast';
import { preloadRoute, preloadRouteChunksWhenIdle, routeIdFromPath } from './pages/lazyPages';
import './styles/index.css';

// Start the current route's chunk and data in parallel with the dataset registry request,
// instead of waiting for App to render (html -> js -> datasets.json -> page chunk -> page data).
preloadRoute(routeIdFromPath(window.location.pathname), storedDatasetId());
preloadRouteChunksWhenIdle();

function storedDatasetId(): string {
   try {
      return window.localStorage.getItem('bibliamap-dataset') ?? 'nwtsty';
   } catch {
      return 'nwtsty';
   }
}

createRoot(document.getElementById('root') as HTMLElement).render(
   <StrictMode>
      <ToastProvider>
         <App />
      </ToastProvider>
   </StrictMode>,
);
