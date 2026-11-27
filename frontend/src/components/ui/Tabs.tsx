import { useId } from 'react';

import { useSlidingIndicator } from '../../hooks/useSlidingIndicator';
import { cx } from '../../lib/cx';

export interface TabItem<TValue extends string> {
   value: TValue;
   label: React.ReactNode;
   icon?: React.ReactNode;
   /** Small trailing number (result count, unread, …). */
   count?: number | string;
   disabled?: boolean;
}

export interface TabsProps<TValue extends string> {
   /** Accessible name of the tab list. */
   label: string;
   items: TabItem<TValue>[];
   value: TValue;
   onChange: (value: TValue) => void;
   /** underline — page/section tabs. pill — compact, inside panels and toolbars. */
   variant?: 'underline' | 'pill';
   size?: 'sm' | 'md';
   /** Stretch tabs to share the full width equally. */
   block?: boolean;
   /**
    * Shared id prefix linking tabs to panels. Pass the same value to <TabPanel idBase>.
    * Omit when the tabs only filter content in place (no separate panels).
    */
   idBase?: string;
   className?: string;
}

export function tabId(idBase: string, value: string): string {
   return `${idBase}-tab-${value}`;
}

export function tabPanelId(idBase: string, value: string): string {
   return `${idBase}-panel-${value}`;
}

/**
 * Accessible tab list (roving tabindex, arrow/Home/End keys, automatic activation)
 * with a highlight that slides between tabs.
 */
export function Tabs<TValue extends string>({
   label,
   items,
   value,
   onChange,
   variant = 'underline',
   size = 'md',
   block = false,
   idBase,
   className,
}: TabsProps<TValue>): React.ReactElement {
   const generatedId = useId();
   const base = idBase ?? generatedId;
   const listRef = useSlidingIndicator<HTMLDivElement>(`${value}:${items.length}`);

   const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
      const enabled = items.filter((item) => !item.disabled);
      const index = enabled.findIndex((item) => item.value === value);
      let nextIndex = index;

      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
         nextIndex = (index + 1) % enabled.length;
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
         nextIndex = (index - 1 + enabled.length) % enabled.length;
      } else if (event.key === 'Home') {
         nextIndex = 0;
      } else if (event.key === 'End') {
         nextIndex = enabled.length - 1;
      } else {
         return;
      }

      event.preventDefault();

      const next = enabled[nextIndex];

      if (next) {
         onChange(next.value);
         event.currentTarget.querySelector<HTMLElement>(`#${CSS.escape(tabId(base, next.value))}`)?.focus();
      }
   };

   return (
      <div
         ref={listRef}
         role="tablist"
         aria-label={label}
         className={cx('ui-tabs', `ui-tabs--${variant}`, `ui-tabs--${size}`, block && 'ui-tabs--block', className)}
         onKeyDown={handleKeyDown}
      >
         {items.map((item) => {
            const active = item.value === value;

            return (
               <button
                  key={item.value}
                  id={tabId(base, item.value)}
                  type="button"
                  role="tab"
                  className="ui-tabs__tab"
                  aria-selected={active}
                  aria-controls={idBase ? tabPanelId(idBase, item.value) : undefined}
                  tabIndex={active ? 0 : -1}
                  data-active={active}
                  disabled={item.disabled}
                  onClick={() => onChange(item.value)}
               >
                  {item.icon}
                  <span>{item.label}</span>
                  {item.count !== undefined ? <span className="ui-tabs__count">{item.count}</span> : null}
               </button>
            );
         })}
      </div>
   );
}

export interface TabPanelProps extends React.HTMLAttributes<HTMLDivElement> {
   idBase: string;
   value: string;
   /** The currently selected tab value; the panel renders only when it matches. */
   activeValue: string;
}

export function TabPanel({
   idBase,
   value,
   activeValue,
   className,
   children,
   ...rest
}: TabPanelProps): React.ReactElement | null {
   if (value !== activeValue) {
      return null;
   }

   return (
      <div
         id={tabPanelId(idBase, value)}
         role="tabpanel"
         aria-labelledby={tabId(idBase, value)}
         tabIndex={0}
         className={cx('ui-tabpanel anim-fade-in', className)}
         {...rest}
      >
         {children}
      </div>
   );
}
