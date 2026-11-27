import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, X } from 'lucide-react';

import { cx } from '../../lib/cx';

export type ChipTone = 'neutral' | 'accent' | 'gilt' | 'rubric' | 'outgoing' | 'incoming' | 'both';

export interface ChipProps {
   tone?: ChipTone;
   size?: 'sm' | 'md';
   /** Pressed/selected state (rendered as aria-pressed when the chip is a button). */
   selected?: boolean;
   leading?: React.ReactNode;
   /** Trailing number, e.g. how many references. */
   count?: number | string;
   /** Makes the chip a button. */
   onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
   /** Adds a dismiss button after the label. */
   onRemove?: () => void;
   removeLabel?: string;
   className?: string;
   title?: string;
   children: React.ReactNode;
}

/** Compact label. Static by default; interactive when `onClick` is given. */
export function Chip({
   tone = 'neutral',
   size = 'md',
   selected = false,
   leading,
   count,
   onClick,
   onRemove,
   removeLabel = 'Remove',
   className,
   title,
   children,
}: ChipProps): React.ReactElement {
   const classes = cx(
      'ui-chip',
      `ui-chip--${tone}`,
      `ui-chip--${size}`,
      selected && 'is-selected',
      onClick && 'ui-chip--interactive',
      className,
   );
   const body = (
      <>
         {leading ? <span className="ui-chip__leading">{leading}</span> : null}
         <span className="ui-chip__label">{children}</span>
         {count !== undefined ? <span className="ui-chip__count">{count}</span> : null}
      </>
   );

   if (onRemove) {
      return (
         <span className={classes} title={title}>
            {onClick ? (
               <button type="button" className="ui-chip__main" aria-pressed={selected} onClick={onClick}>
                  {body}
               </button>
            ) : (
               body
            )}
            <button type="button" className="ui-chip__remove" aria-label={removeLabel} onClick={onRemove}>
               <X size={12} strokeWidth={2.5} />
            </button>
         </span>
      );
   }

   if (onClick) {
      return (
         <button type="button" className={classes} aria-pressed={selected} title={title} onClick={onClick}>
            {body}
         </button>
      );
   }

   return (
      <span className={classes} title={title}>
         {body}
      </span>
   );
}

export type ReferenceDirection = 'outgoing' | 'incoming' | 'both';

export interface ReferenceChipProps extends Omit<ChipProps, 'tone' | 'leading' | 'children'> {
   /** Citation text, e.g. "Romans 1:12". */
   reference: string;
   /** Direction relative to the verse being studied; picks colour and arrow. */
   direction?: ReferenceDirection;
}

const directionIcons: Record<ReferenceDirection, React.ReactNode> = {
   outgoing: <ArrowUpRight size={13} strokeWidth={2.4} />,
   incoming: <ArrowDownLeft size={13} strokeWidth={2.4} />,
   both: <ArrowLeftRight size={13} strokeWidth={2.4} />,
};

const directionNames: Record<ReferenceDirection, string> = {
   outgoing: 'Cited by this verse',
   incoming: 'Cites this verse',
   both: 'Linked in both directions',
};

/**
 * A scripture citation as a chip — the unit of navigation in BibliaMap.
 * Direction is encoded by colour, an arrow, and a text alternative (never colour alone).
 */
export function ReferenceChip({ reference, direction, ...rest }: ReferenceChipProps): React.ReactElement {
   return (
      <Chip
         tone={direction ?? 'neutral'}
         leading={direction ? directionIcons[direction] : undefined}
         title={direction ? `${reference} — ${directionNames[direction]}` : undefined}
         {...rest}
         className={cx('ui-chip--reference', rest.className)}
      >
         {reference}
         {direction ? <span className="visually-hidden"> ({directionNames[direction]})</span> : null}
      </Chip>
   );
}
