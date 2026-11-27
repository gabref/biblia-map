import { X } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';

import { useT } from '../../i18n';
import { cx } from '../../lib/cx';
import { IconButton } from './Button';

export type SheetSide = 'right' | 'left' | 'bottom' | 'center' | 'responsive';

export interface SheetProps {
   open: boolean;
   onClose: () => void;
   /**
    * right / left — drawer docked to an edge (detail, filters).
    * bottom       — bottom sheet (mobile actions).
    * center       — modal dialog.
    * responsive   — right drawer on wide screens, bottom sheet under 760px. Default.
    */
   side?: SheetSide;
   size?: 'sm' | 'md' | 'lg';
   title: React.ReactNode;
   description?: React.ReactNode;
   /** Sticky footer, usually buttons. */
   footer?: React.ReactNode;
   /** Hide the heading visually (it still names the dialog). */
   hideTitle?: boolean;
   className?: string;
   children: React.ReactNode;
}

/**
 * Modal surface built on the native <dialog>: focus is trapped and restored by the
 * browser, Escape and backdrop click close it, and the page behind is inert.
 * Enter/exit motion is pure CSS (@starting-style), so reduced-motion is honoured by tokens.
 */
export function Sheet({
   open,
   onClose,
   side = 'responsive',
   size = 'md',
   title,
   description,
   footer,
   hideTitle = false,
   className,
   children,
}: SheetProps): React.ReactElement {
   const t = useT();
   const dialogRef = useRef<HTMLDialogElement | null>(null);
   const titleId = useId();
   const descriptionId = useId();

   useEffect(() => {
      const dialog = dialogRef.current;

      if (!dialog) {
         return;
      }

      if (open && !dialog.open) {
         if (typeof dialog.showModal === 'function') {
            dialog.showModal();
         } else {
            dialog.setAttribute('open', '');
         }
      } else if (!open && dialog.open) {
         if (typeof dialog.close === 'function') {
            dialog.close();
         } else {
            dialog.removeAttribute('open');
         }
      }
   }, [ open ]);

   return (
      <dialog
         ref={dialogRef}
         className={cx('ui-sheet', `ui-sheet--${side}`, `ui-sheet--${size}`, className)}
         aria-labelledby={titleId}
         aria-describedby={description ? descriptionId : undefined}
         onCancel={(event) => {
            event.preventDefault();
            onClose();
         }}
         onClose={() => {
            if (open) {
               onClose();
            }
         }}
         onClick={(event) => {
            if (event.target === dialogRef.current) {
               onClose();
            }
         }}
      >
         {open ? (
            <div className="ui-sheet__surface">
               <header className="ui-sheet__header">
                  <div>
                     <h2 id={titleId} className={cx('ui-sheet__title', hideTitle && 'visually-hidden')}>
                        {title}
                     </h2>
                     {description ? (
                        <p id={descriptionId} className="ui-sheet__description">
                           {description}
                        </p>
                     ) : null}
                  </div>
                  <IconButton className="ui-sheet__close" label={t('shell.close')} size="sm" onClick={onClose}>
                     <X size={16} />
                  </IconButton>
               </header>
               <div className="ui-sheet__body">{children}</div>
               {footer ? <footer className="ui-sheet__footer">{footer}</footer> : null}
            </div>
         ) : null}
      </dialog>
   );
}

/** Alias for edge-docked usage. */
export const Drawer = Sheet;
