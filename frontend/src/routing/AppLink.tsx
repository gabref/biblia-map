import type { AnchorHTMLAttributes, MouseEvent, ReactElement, Ref } from 'react';

import { navigate } from './routes';

/** True for a plain primary click: modifier and middle clicks must open a new tab/window. */
export function isPlainLeftClick(event: Pick<MouseEvent, 'button' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>): boolean {
   return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

export interface AppLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
   href: string;
   replace?: boolean;
   ref?: Ref<HTMLAnchorElement>;
}

/**
 * In-app anchor for non-verse destinations (nav, chapters, books). Plain clicks navigate
 * client-side; Ctrl/Cmd/Shift/middle clicks and `target="_blank"` fall through to the browser.
 * For verse labels use `VerseLink`.
 */
export function AppLink({ href, replace, onClick, target, ref, ...props }: AppLinkProps): ReactElement {
   const handleClick = (event: MouseEvent<HTMLAnchorElement>): void => {
      onClick?.(event);

      if (event.defaultPrevented || !isPlainLeftClick(event) || (target && target !== '_self')) {
         return;
      }

      event.preventDefault();
      navigate(href, { replace });
   };

   return <a {...props} ref={ref} href={href} target={target} onClick={handleClick} />;
}
