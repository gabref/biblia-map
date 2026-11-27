import { Monitor, Moon, Sun } from 'lucide-react';

import { THEME_ORDER } from '../../hooks/useTheme';
import type { ThemePreference, ThemeState } from '../../hooks/useTheme';
import { useT } from '../../i18n';
import type { MessageKey } from '../../i18n';
import { cx } from '../../lib/cx';

export interface ThemeToggleProps {
   /** Pass the result of useTheme() (call the hook once, in the shell). */
   theme: ThemeState;
   /** Show the "Dark"/"Light"/"System" word next to the icon. */
   showLabel?: boolean;
   className?: string;
}

const NAMES: Record<ThemePreference, MessageKey> = {
   dark: 'shell.theme.dark',
   light: 'shell.theme.light',
   system: 'shell.theme.system',
};
const TARGETS: Record<ThemePreference, MessageKey> = {
   dark: 'shell.theme.toDark',
   light: 'shell.theme.toLight',
   system: 'shell.theme.toSystem',
};
const ICONS: Record<ThemePreference, typeof Moon> = { dark: Moon, light: Sun, system: Monitor };

/** Steps the theme: dark (the default) → light → match the device → dark. The choice is remembered. */
export function ThemeToggle({ theme, showLabel = false, className }: ThemeToggleProps): React.ReactElement {
   const t = useT();
   const { preference } = theme;
   const next = THEME_ORDER[(THEME_ORDER.indexOf(preference) + 1) % THEME_ORDER.length];
   const Icon = ICONS[preference];
   const action = t(TARGETS[next]);

   return (
      <button
         type="button"
         className={cx('ui-theme-toggle', showLabel && 'ui-theme-toggle--labelled', className)}
         aria-label={action}
         title={t('shell.theme.current', { name: t(NAMES[preference]).toLowerCase(), action })}
         onClick={theme.cycle}
      >
         <span key={preference} className="ui-theme-toggle__icon" data-theme-icon={preference} aria-hidden="true">
            <Icon size={16} />
         </span>
         {showLabel ? <span>{t(NAMES[preference])}</span> : null}
      </button>
   );
}
