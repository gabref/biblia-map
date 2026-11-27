import { useId } from 'react';

import { cx } from '../../lib/cx';

export interface FieldProps {
   label: string;
   /** Helper text under the control. */
   hint?: string;
   className?: string;
   /** Render prop receiving the id to put on the control. */
   children: (id: string) => React.ReactNode;
}

/** Label + control + hint, wired by id. */
export function Field({ label, hint, className, children }: FieldProps): React.ReactElement {
   const id = useId();

   return (
      <div className={cx('ui-field', className)}>
         <label className="ui-field__label" htmlFor={id}>
            {label}
         </label>
         {children(id)}
         {hint ? <p className="ui-field__hint">{hint}</p> : null}
      </div>
   );
}

export interface SelectOption<TValue extends string> {
   value: TValue;
   label: string;
}

export interface SelectProps<TValue extends string>
   extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange' | 'size'> {
   value: TValue;
   options: SelectOption<TValue>[];
   onChange: (value: TValue) => void;
   size?: 'sm' | 'md';
}

/** Styled native select — keeps the platform picker, which is the best one on phones. */
export function Select<TValue extends string>({
   value,
   options,
   onChange,
   size = 'md',
   className,
   ...rest
}: SelectProps<TValue>): React.ReactElement {
   return (
      <select
         className={cx('ui-select', `ui-select--${size}`, className)}
         value={value}
         onChange={(event) => onChange(event.target.value as TValue)}
         {...rest}
      >
         {options.map((option) => (
            <option key={option.value} value={option.value}>
               {option.label}
            </option>
         ))}
      </select>
   );
}
