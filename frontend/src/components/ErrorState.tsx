import { AlertTriangle, RotateCw } from 'lucide-react';

import { Button } from './ui/Button';

interface ErrorStateProps {
   title: string;
   error: Error;
   /** Retry handler. Without one the button reloads the page. */
   onRetry?: () => void;
}

export function ErrorState({ title, error, onRetry }: ErrorStateProps): React.ReactElement {
   return (
      <section className="error-state" role="alert">
         <AlertTriangle size={20} aria-hidden="true" />
         <div className="error-state-body">
            <h2>{title}</h2>
            <p>{error.message}</p>
            <Button
               className="error-state-action"
               size="sm"
               leading={<RotateCw size={14} />}
               onClick={onRetry ?? (() => window.location.reload())}
            >
               {onRetry ? 'Try again' : 'Reload page'}
            </Button>
         </div>
      </section>
   );
}
