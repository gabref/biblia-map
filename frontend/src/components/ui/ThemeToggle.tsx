import { Moon, Sun } from 'lucide-react';

import type { ThemeState } from '../../hooks/useTheme';
import { cx } from '../../lib/cx';

export interface ThemeToggleProps {
   /** Pass the result of useTheme() (call the hook once, in the shell). */
   theme: ThemeState;
   /** Show the "Light"/"Dark" word next to the icon. */
   showLabel?: boolean;
   className?: string;
}

/** Switch between light and dark. Until first use the app follows the OS setting. */
export function ThemeToggle({ theme, showLabel = false, className }: ThemeToggleProps): React.ReactElement {
   const isDark = theme.resolved === 'dark';
   const label = isDark ? 'Switch to light theme' : 'Switch to dark theme';

   return (
      <button
         type="button"
         className={cx('ui-theme-toggle', showLabel && 'ui-theme-toggle--labelled', className)}
         aria-label={label}
         title={label}
         onClick={theme.toggle}
      >
         <span key={theme.resolved} className="ui-theme-toggle__icon" data-theme-icon={isDark ? 'dark' : 'light'} aria-hidden="true">
            {isDark ? <Moon size={16} /> : <Sun size={16} />}
         </span>
         {showLabel ? <span>{isDark ? 'Dark' : 'Light'}</span> : null}
      </button>
   );
}
