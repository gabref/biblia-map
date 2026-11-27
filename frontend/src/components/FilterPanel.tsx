import { SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';

import { useMediaQuery } from '../hooks/useMediaQuery';
import { useT } from '../i18n';
import { BottomSheet } from './BottomSheet';
import { Button } from './ui/Button';

interface FilterPanelProps {
   title: string;
   children: React.ReactNode;
   /**
    * Collapse into a "Filters (n)" button that opens a bottom sheet on phones (< 760px).
    * Off by default so existing pages keep their inline panel until their owners opt in.
    */
   collapsible?: boolean;
   /** Number of non-default filters, shown on the collapsed button. */
   activeCount?: number;
   /** Shows a "Reset" action in the sheet when something is filtered. */
   onReset?: () => void;
}

export function FilterPanel({ title, children, collapsible = false, activeCount = 0, onReset }: FilterPanelProps): React.ReactElement {
   const t = useT();
   const compact = useMediaQuery('(max-width: 760px)');
   const [ open, setOpen ] = useState(false);

   if (collapsible && compact) {
      return (
         <>
            <div className="filter-panel-trigger">
               <Button
                  variant="secondary"
                  leading={<SlidersHorizontal size={16} />}
                  aria-haspopup="dialog"
                  aria-expanded={open}
                  onClick={() => setOpen(true)}
               >
                  {activeCount > 0 ? t('shell.filters.openCount', { count: activeCount }) : t('shell.filters.open')}
               </Button>
               {activeCount > 0 ? (
                  <span className="visually-hidden">{t('shell.filters.activeCount', { count: activeCount })}</span>
               ) : null}
            </div>
            <BottomSheet
               open={open}
               onClose={() => setOpen(false)}
               title={title}
               footer={
                  <>
                     {onReset && activeCount > 0 ? (
                        <Button variant="ghost" onClick={onReset}>
                           {t('shell.reset')}
                        </Button>
                     ) : null}
                     <Button variant="primary" onClick={() => setOpen(false)}>
                        {t('shell.done')}
                     </Button>
                  </>
               }
            >
               <div className="filter-panel-body filter-panel-body--sheet">{children}</div>
            </BottomSheet>
         </>
      );
   }

   return (
      <section className="filter-panel" aria-label={title}>
         <div className="filter-panel-title">{title}</div>
         <div className="filter-panel-body">{children}</div>
      </section>
   );
}
