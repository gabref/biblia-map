import { ArrowRight, Footprints } from 'lucide-react';

import { VerseLink } from '../../components/VerseLink';
import { useT } from '../../i18n';
import { cx } from '../../lib/cx';
import type { RouteParams, VerseLocation } from '../../routing/routes';

export interface TrailItem {
   key: string;
   label: string;
   verse: VerseLocation;
   current: boolean;
}

export interface StudyTrailProps {
   items: readonly TrailItem[];
   /** Query params carried by every link (dataset, filters). */
   params: RouteParams;
   onStudy: (verse: VerseLocation) => void;
}

/** True for a plain left click: the only kind the app handles itself (others open a new tab). */
export function isPlainClick(event: React.MouseEvent): boolean {
   return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

/** The path walked in this session: "John 3:16 → 1 John 4:9 → Romans 5:8". */
export function StudyTrail({ items, params, onStudy }: StudyTrailProps): React.ReactElement | null {
   const t = useT();

   if (items.length < 2) {
      return null;
   }

   return (
      <nav className="vs-trail" aria-label={t('verse.trail.label')}>
         <span className="vs-trail__title">
            <Footprints size={14} aria-hidden="true" />
            {t('verse.trail.title')}
         </span>
         <ol className="vs-trail__list">
            {items.map((item, index) => (
               <li key={item.key} className="vs-trail__item anim-fade-in">
                  {index > 0 ? <ArrowRight className="vs-trail__arrow" size={13} aria-hidden="true" /> : null}
                  <VerseLink
                     verse={item.verse}
                     params={params}
                     label={item.label}
                     className={cx('vs-trail__link', item.current && 'is-current')}
                     aria-current={item.current ? 'page' : undefined}
                     onClick={(event) => {
                        if (isPlainClick(event)) {
                           event.preventDefault();

                           if (!item.current) {
                              onStudy(item.verse);
                           }
                        }
                     }}
                  />
               </li>
            ))}
         </ol>
      </nav>
   );
}
