interface LoadingShimmerProps {
   rows?: number;
}

/** Page-level loading placeholder. For shaped placeholders inside a layout, use <Skeleton> from components/ui. */
export function LoadingShimmer({ rows = 4 }: LoadingShimmerProps): React.ReactElement {
   return (
      <div className="loading-shimmer" role="status" aria-label="Loading" aria-busy="true">
         {Array.from({ length: rows }, (_, index) => (
            <span key={index} aria-hidden="true" />
         ))}
      </div>
   );
}
