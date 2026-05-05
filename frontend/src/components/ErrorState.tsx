import { AlertTriangle } from 'lucide-react';

interface ErrorStateProps {
   title: string;
   error: Error;
}

export function ErrorState({ title, error }: ErrorStateProps): React.ReactElement {
   return (
      <section className="error-state" role="alert">
         <AlertTriangle size={22} />
         <div>
            <h2>{title}</h2>
            <p>{error.message}</p>
         </div>
      </section>
   );
}
