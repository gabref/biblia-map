import { cx } from '../../lib/cx';

export interface KbdProps {
   className?: string;
   children: React.ReactNode;
}

/** A keyboard key, e.g. <Kbd>⌘</Kbd><Kbd>K</Kbd> or <Kbd>/</Kbd>. */
export function Kbd({ className, children }: KbdProps): React.ReactElement {
   return <kbd className={cx('ui-kbd', className)}>{children}</kbd>;
}
