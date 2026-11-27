import { Sheet, type SheetProps } from './ui/Sheet';

export type BottomSheetProps = Omit<SheetProps, 'side'> & {
   /** Keep the bottom sheet on wide screens too (default: a right drawer from 760px up). */
   alwaysBottom?: boolean;
};

/**
 * Bottom sheet for phones (filters, connection detail, actions). Built on `Sheet`, so it is
 * a native modal `<dialog>`: focus trap and restore, Esc, backdrop tap, inert page behind.
 * On screens ≥ 760px it becomes a right drawer unless `alwaysBottom` is set.
 *
 * One-handed use: the close button and footer actions are 44px targets on phones; put the
 * primary action in `footer` (bottom of the reach zone), not in the body's first line.
 */
export function BottomSheet({ alwaysBottom = false, ...props }: BottomSheetProps): React.ReactElement {
   return <Sheet {...props} side={alwaysBottom ? 'bottom' : 'responsive'} />;
}
