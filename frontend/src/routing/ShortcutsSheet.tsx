import { Kbd } from '../components/ui/Kbd';
import { Sheet } from '../components/ui/Sheet';
import { SHORTCUTS, isApplePlatform } from '../hooks/useKeyboardShortcuts';
import { useT } from '../i18n';

/** `?` help: every global shortcut, rendered with <Kbd>. */
export function ShortcutsSheet({ open, onClose }: { open: boolean; onClose: () => void }): React.ReactElement {
   const t = useT();
   const mod = isApplePlatform() ? '⌘' : 'Ctrl';

   return (
      <Sheet open={open} onClose={onClose} side="center" size="sm" title={t('home.shortcuts.title')} description={t('home.shortcuts.description')}>
         <dl className="shortcuts-list">
            {SHORTCUTS.map((shortcut) => (
               <div key={shortcut.keys.join('+')} className="shortcuts-list__row">
                  <dt>
                     {shortcut.keys.map((key) => (
                        <Kbd key={key}>{key === 'mod' ? mod : key}</Kbd>
                     ))}
                  </dt>
                  <dd>{t(shortcut.description)}</dd>
               </div>
            ))}
         </dl>
      </Sheet>
   );
}
