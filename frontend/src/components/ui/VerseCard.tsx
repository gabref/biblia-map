import { cx } from '../../lib/cx';
import { Skeleton } from './Skeleton';

export interface VerseCardProps {
   /** Citation, e.g. "Romans 1:12". */
   reference: string;
   /** Verse text. `undefined` = still loading (skeleton); `null` = not available in this dataset. */
   text?: string | null;
   /**
    * default  — a verse in a list.
    * selected — the verse being studied (rubric rule, gilt wash).
    * outgoing / incoming — a neighbour, tinted by direction.
    */
   tone?: 'default' | 'selected' | 'outgoing' | 'incoming';
   /** compact — reference + two clamped lines, for lists and hover previews. */
   density?: 'comfortable' | 'compact';
   /** Small line under the reference: direction, reference type, counts. */
   meta?: React.ReactNode;
   /** Trailing controls (open, copy, pin). */
   actions?: React.ReactNode;
   /** Makes the whole card a button. */
   onClick?: () => void;
   /** Shared-element name so the card can morph between views (View Transitions). */
   transitionName?: string;
   className?: string;
}

/**
 * The core object of the app: a citation plus its text, set as scripture.
 * Used for the selected verse, neighbour lists, hover previews and search results.
 */
export function VerseCard({
   reference,
   text,
   tone = 'default',
   density = 'comfortable',
   meta,
   actions,
   onClick,
   transitionName,
   className,
}: VerseCardProps): React.ReactElement {
   const classes = cx(
      'ui-verse',
      `ui-verse--${tone}`,
      `ui-verse--${density}`,
      onClick && 'ui-verse--interactive',
      className,
   );
   const style = transitionName ? ({ viewTransitionName: transitionName } as React.CSSProperties) : undefined;
   const body = (
      <>
         <span className="ui-verse__head">
            <span className="ui-verse__ref t-ref">{reference}</span>
            {meta ? <span className="ui-verse__meta">{meta}</span> : null}
         </span>
         {text === undefined ? (
            <Skeleton lines={density === 'compact' ? 2 : 3} />
         ) : text === null ? (
            <span className="ui-verse__missing">Verse text is not included in this dataset.</span>
         ) : (
            <span className="ui-verse__text">{text}</span>
         )}
      </>
   );

   if (onClick && !actions) {
      return (
         <button type="button" className={classes} style={style} onClick={onClick}>
            {body}
         </button>
      );
   }

   return (
      <article className={classes} style={style} aria-label={reference}>
         {onClick ? (
            <button type="button" className="ui-verse__main" onClick={onClick}>
               {body}
            </button>
         ) : (
            <div className="ui-verse__main">{body}</div>
         )}
         {actions ? <div className="ui-verse__actions">{actions}</div> : null}
      </article>
   );
}
