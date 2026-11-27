import { useT } from '../i18n';

interface LoadingShimmerProps {
   rows?: number;
   /** Spoken instead of the generic "Loading…". */
   label?: string;
}

/** Page-level loading placeholder. For shaped placeholders inside a layout, use <Skeleton> from components/ui. */
export function LoadingShimmer({ rows = 4, label }: LoadingShimmerProps): React.ReactElement {
   const t = useT();

   return (
      <div className="loading-shimmer" role="status" aria-busy="true">
         <span className="visually-hidden">{label ?? t('shell.loading')}</span>
         {Array.from({ length: rows }, (_, index) => (
            <span key={index} className="loading-shimmer__bar" aria-hidden="true" />
         ))}
      </div>
   );
}
