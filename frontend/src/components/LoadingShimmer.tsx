interface LoadingShimmerProps {
   rows?: number;
}

export function LoadingShimmer({ rows = 4 }: LoadingShimmerProps): React.ReactElement {
   return (
      <div className="loading-shimmer" aria-label="Loading">
         {Array.from({ length: rows }, (_, index) => (
            <span key={index} />
         ))}
      </div>
   );
}
