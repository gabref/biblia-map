import { cx } from '../../lib/cx';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
   variant?: ButtonVariant;
   size?: ButtonSize;
   /** Icon before the label. */
   leading?: React.ReactNode;
   /** Icon after the label. */
   trailing?: React.ReactNode;
   /** Shows a spinner, sets aria-busy and blocks clicks. */
   loading?: boolean;
   /** Stretch to the container width. */
   block?: boolean;
   ref?: React.Ref<HTMLButtonElement>;
}

export function Button({
   variant = 'secondary',
   size = 'md',
   leading,
   trailing,
   loading = false,
   block = false,
   className,
   children,
   disabled,
   type = 'button',
   ...rest
}: ButtonProps): React.ReactElement {
   return (
      <button
         type={type}
         className={cx('ui-button', `ui-button--${variant}`, `ui-button--${size}`, block && 'ui-button--block', className)}
         disabled={disabled || loading}
         aria-busy={loading || undefined}
         {...rest}
      >
         {loading ? <span className="ui-spinner" aria-hidden="true" /> : leading}
         {children ? <span className="ui-button__label">{children}</span> : null}
         {trailing}
      </button>
   );
}

export interface IconButtonProps extends Omit<ButtonProps, 'leading' | 'trailing' | 'block' | 'children'> {
   /** Accessible name; also used as the native tooltip unless `title` is given. */
   label: string;
   children: React.ReactNode;
}

/** Square, icon-only button. `label` is required because there is no visible text. */
export function IconButton({
   label,
   variant = 'ghost',
   size = 'md',
   className,
   children,
   loading = false,
   disabled,
   type = 'button',
   title,
   ...rest
}: IconButtonProps): React.ReactElement {
   return (
      <button
         type={type}
         className={cx('ui-button', 'ui-button--icon', `ui-button--${variant}`, `ui-button--${size}`, className)}
         aria-label={label}
         title={title ?? label}
         disabled={disabled || loading}
         aria-busy={loading || undefined}
         {...rest}
      >
         {loading ? <span className="ui-spinner" aria-hidden="true" /> : children}
      </button>
   );
}
