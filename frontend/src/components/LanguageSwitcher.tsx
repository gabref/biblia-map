import { LOCALES, LOCALE_NAMES, setLocale, useLocale, useT, type Locale } from '../i18n';
import { cx } from '../lib/cx';

export interface LanguageSwitcherProps {
   className?: string;
   /** Called after the language changes (e.g. to close a menu). */
   onChange?: (locale: Locale) => void;
}

/**
 * EN / IT switch for the shell. Self-contained: it reads and sets the locale through i18n
 * (persisted in localStorage, and kept in step with a `?lang=` already in the URL), so the
 * shell only has to mount it, e.g. next to the theme toggle:
 *
 *    <div className="sidebar-tools">
 *       <DatasetBadge … />
 *       <LanguageSwitcher />
 *       <ThemeToggle theme={theme} />
 *    </div>
 */
export function LanguageSwitcher({ className, onChange }: LanguageSwitcherProps): React.ReactElement {
   const locale = useLocale();
   const t = useT();

   return (
      <div className={cx('language-switcher', className)} role="group" aria-label={t('shell.language.label')}>
         {LOCALES.map((option) => {
            const active = option === locale;

            return (
               <button
                  key={option}
                  type="button"
                  lang={option}
                  aria-pressed={active}
                  // The endonym ("Italiano") is the accessible name, spoken in its own language.
                  aria-label={LOCALE_NAMES[option]}
                  title={active ? LOCALE_NAMES[option] : t('shell.language.switchTo', { language: LOCALE_NAMES[option] })}
                  data-active={active}
                  onClick={() => {
                     if (!active) {
                        setLocale(option);
                        onChange?.(option);
                     }
                  }}
               >
                  {option.toUpperCase()}
               </button>
            );
         })}
      </div>
   );
}
