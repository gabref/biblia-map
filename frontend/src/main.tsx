import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { ToastProvider } from './components/ui/Toast';
import './styles/index.css';

createRoot(document.getElementById('root') as HTMLElement).render(
   <StrictMode>
      <ToastProvider>
         <App />
      </ToastProvider>
   </StrictMode>,
);
