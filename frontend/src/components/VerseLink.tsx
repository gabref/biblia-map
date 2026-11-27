import type { AnchorHTMLAttributes, MouseEvent, ReactElement, ReactNode, Ref } from 'react';

import { bookByNumber, navigate, verseHref, type RouteParams, type VerseLocation } from '../routing/routes';

/**
 * The verse to link to. Any `VerseRef` from `types/generated` fits. A bare `jwpubVerseId`
 * is deliberately NOT accepted: resolving it needs the (async, 4 MB) verse index, so resolve
 * it to a ref first. If `label` is present it is used as the default link text.
 */
export type VerseLinkTarget = VerseLocation & { label?: string };

export interface VerseLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
   /** Verse to link to. (Named `verse`, not `ref`: `ref` is React's reserved prop and is forwarded to the `<a>`.) */
   verse: VerseLinkTarget;
   /** Link text when no children are given. Defaults to `verse.label`, then an English "John 3:16". */
   label?: string;
   /** Query params to carry over (dataset, filters). */
   params?: RouteParams;
   /** Use `replaceState` instead of `pushState`. */
   replace?: boolean;
   children?: ReactNode;
   ref?: Ref<HTMLAnchorElement>;
}

/** English fallback label, e.g. "John 3:16". Prefer the dataset's localized `label` when available. */
export function fallbackVerseLabel(verse: VerseLocation): string {
   const name = bookByNumber(verse.bookNumber)?.nameEn ?? `Book ${verse.bookNumber}`;

   return `${name} ${verse.chapterNumber}:${verse.verseNumber}`;
}

function isPlainLeftClick(event: MouseEvent<HTMLAnchorElement>): boolean {
   return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

/**
 * Anchor to a verse's Study page. Plain left clicks navigate client-side via `navigate()`;
 * modifier clicks, middle clicks and `target` other than `_self` fall through to the browser
 * (new tab / window). All epics must use this for any verse label (§6.1).
 */
export function VerseLink({
   verse,
   label,
   params,
   replace,
   children,
   onClick,
   target,
   ref,
   ...anchorProps
}: VerseLinkProps): ReactElement {
   const href = verseHref(verse, params);

   const handleClick = (event: MouseEvent<HTMLAnchorElement>): void => {
      onClick?.(event);

      if (event.defaultPrevented || !isPlainLeftClick(event) || (target && target !== '_self')) {
         return;
      }

      event.preventDefault();
      navigate(href, { replace });
   };

   return (
      <a {...anchorProps} ref={ref} href={href} target={target} onClick={handleClick}>
         {children ?? label ?? verse.label ?? fallbackVerseLabel(verse)}
      </a>
   );
}
