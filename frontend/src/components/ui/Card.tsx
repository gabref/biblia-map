import { cx } from '../../lib/cx';

export interface CardProps extends React.HTMLAttributes<HTMLElement> {
   /** Element to render. Use 'section'/'article'/'aside' when the card is a landmark. */
   as?: 'div' | 'section' | 'article' | 'aside' | 'li';
   /**
    * surface  — default panel on the page.
    * raised   — floats above a surface (popovers, sticky panels).
    * sunken   — a well: graph canvases, code, inset lists.
    * outline  — border only, no fill.
    */
   variant?: 'surface' | 'raised' | 'sunken' | 'outline';
   padding?: 'none' | 'sm' | 'md' | 'lg';
   /** Hover/press affordance for cards that are themselves a click target. */
   interactive?: boolean;
   ref?: React.Ref<HTMLElement>;
}

export function Card({
   as: Element = 'div',
   variant = 'surface',
   padding = 'md',
   interactive = false,
   className,
   ref,
   ...rest
}: CardProps): React.ReactElement {
   return (
      <Element
         ref={ref as React.Ref<never>}
         className={cx(
            'ui-card',
            `ui-card--${variant}`,
            `ui-card--pad-${padding}`,
            interactive && 'ui-card--interactive',
            className,
         )}
         {...rest}
      />
   );
}

export interface CardHeaderProps {
   title: React.ReactNode;
   description?: React.ReactNode;
   icon?: React.ReactNode;
   /** Right-aligned control(s): a button, a segmented control, a count. */
   action?: React.ReactNode;
   /** Heading level for the title. */
   level?: 2 | 3 | 4;
   className?: string;
}

export function CardHeader({
   title,
   description,
   icon,
   action,
   level = 2,
   className,
}: CardHeaderProps): React.ReactElement {
   const Heading = `h${level}` as 'h2' | 'h3' | 'h4';

   return (
      <header className={cx('ui-card__header', className)}>
         {icon ? (
            <span className="ui-card__icon" aria-hidden="true">
               {icon}
            </span>
         ) : null}
         <div className="ui-card__heading">
            <Heading className="ui-card__title">{title}</Heading>
            {description ? <p className="ui-card__description">{description}</p> : null}
         </div>
         {action ? <div className="ui-card__action">{action}</div> : null}
      </header>
   );
}

/** Alias: a Card used as a page region. */
export const Panel = Card;
