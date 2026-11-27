import { cloneElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { cx } from '../../lib/cx';

export type TooltipSide = 'top' | 'bottom' | 'left' | 'right';

export interface TooltipProps {
   /** Tooltip body. Falsy content disables the tooltip. */
   content: React.ReactNode;
   /** Preferred side; flips automatically when there is no room. */
   side?: TooltipSide;
   /** Hover delay in ms. Focus always opens immediately. */
   delay?: number;
   /**
    * label — one short line naming a control.
    * card  — rich preview (e.g. the text of a referenced verse); wider, serif-friendly.
    */
   variant?: 'label' | 'card';
   /** The trigger. Must be a single focusable element (button, link, chip…). */
   children: React.ReactElement;
}

interface Position {
   top: number;
   left: number;
   side: TooltipSide;
}

const GAP = 8;
const EDGE = 8;

function place(anchor: DOMRect, bubble: DOMRect, preferred: TooltipSide): Position {
   const viewportWidth = window.innerWidth;
   const viewportHeight = window.innerHeight;
   const fits: Record<TooltipSide, boolean> = {
      top: anchor.top - bubble.height - GAP >= EDGE,
      bottom: anchor.bottom + bubble.height + GAP <= viewportHeight - EDGE,
      left: anchor.left - bubble.width - GAP >= EDGE,
      right: anchor.right + bubble.width + GAP <= viewportWidth - EDGE,
   };
   const opposite: Record<TooltipSide, TooltipSide> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
   const side = fits[preferred] || !fits[opposite[preferred]] ? preferred : opposite[preferred];
   let top: number;
   let left: number;

   if (side === 'top' || side === 'bottom') {
      top = side === 'top' ? anchor.top - bubble.height - GAP : anchor.bottom + GAP;
      left = anchor.left + anchor.width / 2 - bubble.width / 2;
   } else {
      top = anchor.top + anchor.height / 2 - bubble.height / 2;
      left = side === 'left' ? anchor.left - bubble.width - GAP : anchor.right + GAP;
   }

   return {
      side,
      top: Math.max(EDGE, Math.min(top, viewportHeight - bubble.height - EDGE)),
      left: Math.max(EDGE, Math.min(left, viewportWidth - bubble.width - EDGE)),
   };
}

/**
 * Hover/focus tooltip. Opens after a short delay on hover, immediately on keyboard
 * focus, closes on Escape, scroll or pointer leave. Never opens from touch — anything
 * shown here must also be reachable another way.
 */
export function Tooltip({
   content,
   side = 'top',
   delay = 350,
   variant = 'label',
   children,
}: TooltipProps): React.ReactElement {
   const id = useId();
   const anchorRef = useRef<HTMLSpanElement | null>(null);
   const bubbleRef = useRef<HTMLDivElement | null>(null);
   const timerRef = useRef<number | undefined>(undefined);
   const [ open, setOpen ] = useState(false);
   const [ position, setPosition ] = useState<Position | null>(null);

   const close = useCallback((): void => {
      window.clearTimeout(timerRef.current);
      setOpen(false);
      setPosition(null);
   }, []);

   const openAfter = (ms: number): void => {
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setOpen(true), ms);
   };

   useEffect(() => () => window.clearTimeout(timerRef.current), []);

   useLayoutEffect(() => {
      const anchor = anchorRef.current?.firstElementChild ?? anchorRef.current;
      const bubble = bubbleRef.current;

      if (!open || !anchor || !bubble) {
         return;
      }

      setPosition(place(anchor.getBoundingClientRect(), bubble.getBoundingClientRect(), side));
   }, [ open, side, content ]);

   useEffect(() => {
      if (!open) {
         return undefined;
      }

      const handleKeyDown = (event: KeyboardEvent): void => {
         if (event.key === 'Escape') {
            close();
         }
      };

      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('scroll', close, { capture: true, passive: true });

      return () => {
         window.removeEventListener('keydown', handleKeyDown);
         window.removeEventListener('scroll', close, { capture: true });
      };
   }, [ close, open ]);

   if (!content) {
      return children;
   }

   return (
      <span
         ref={anchorRef}
         className="ui-tooltip-anchor"
         onPointerEnter={(event) => {
            if (event.pointerType !== 'touch') {
               openAfter(delay);
            }
         }}
         onPointerLeave={close}
         onPointerDown={close}
         onFocus={(event) => {
            if (event.target instanceof Element && event.target.matches(':focus-visible')) {
               openAfter(0);
            }
         }}
         onBlur={close}
      >
         {cloneElement(children as React.ReactElement<{ 'aria-describedby'?: string }>, {
            'aria-describedby': open ? id : undefined,
         })}
         {open
            ? createPortal(
                 <div
                    ref={bubbleRef}
                    id={id}
                    role="tooltip"
                    className={cx('ui-tooltip', `ui-tooltip--${variant}`, position && 'is-placed')}
                    data-side={position?.side ?? side}
                    style={position ? { top: position.top, left: position.left } : { top: 0, left: 0 }}
                 >
                    {content}
                 </div>,
                 document.body,
              )
            : null}
      </span>
   );
}
