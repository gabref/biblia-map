import { Search } from 'lucide-react';

import { useT } from '../i18n';
import { cx } from '../lib/cx';
import { Kbd } from './ui/Kbd';
import './VerseSearchTrigger.css';

export interface VerseSearchTriggerProps {
   onOpen: () => void;
   /** Hover/focus: a good moment to fetch the palette chunk. */
   onIntent?: () => void;
   className?: string;
}

/** Shell button that opens the verse search palette; looks like a search field on wide screens. */
export function VerseSearchTrigger({ onOpen, onIntent, className }: VerseSearchTriggerProps): React.ReactElement {
   const t = useT();

   return (
      <button
         type="button"
         className={cx('search-trigger', className)}
         onClick={onOpen}
         onPointerEnter={onIntent}
         onFocus={onIntent}
         // The visible label is hidden on narrow screens (icon only): keep the accessible name.
         aria-label={t('home.search.trigger')}
         aria-haspopup="dialog"
         aria-keyshortcuts="/ Control+K Meta+K"
      >
         <Search size={16} aria-hidden="true" />
         <span className="search-trigger__label">{t('home.search.trigger')}</span>
         <span className="search-trigger__keys" aria-hidden="true">
            <Kbd>/</Kbd>
         </span>
      </button>
   );
}
