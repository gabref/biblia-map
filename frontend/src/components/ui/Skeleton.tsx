import { cx } from '../../lib/cx';

export interface SkeletonProps {
   /** text — a line of copy. block — a card or chart. circle — avatar, node, icon. */
   variant?: 'text' | 'block' | 'circle';
   /** CSS width (number = px). Text lines default to 100%. */
   width?: number | string;
   /** CSS height (number = px). */
   height?: number | string;
   /** For variant="text": render this many lines, the last one shortened. */
   lines?: number;
   className?: string;
}

/** Placeholder shaped like the content that is loading. Decorative: wrap groups in an element with aria-busy. */
export function Skeleton({ variant = 'text', width, height, lines = 1, className }: SkeletonProps): React.ReactElement {
   if (variant === 'text' && lines > 1) {
      return (
         <span className={cx('ui-skeleton-lines', className)} aria-hidden="true">
            {Array.from({ length: lines }, (_, index) => (
               <span
                  key={index}
                  className="ui-skeleton ui-skeleton--text"
                  style={{ width: index === lines - 1 ? '62%' : width }}
               />
            ))}
         </span>
      );
   }

   return (
      <span
         className={cx('ui-skeleton', `ui-skeleton--${variant}`, className)}
         style={{ width, height: variant === 'circle' ? (height ?? width) : height }}
         aria-hidden="true"
      />
   );
}
