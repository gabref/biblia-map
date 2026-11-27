import { cx } from '../../lib/cx';

export interface EmptyStateProps {
   icon?: React.ReactNode;
   title: string;
   /** Say what the person can do next, not just what is missing. */
   description?: React.ReactNode;
   /** Usually one Button. */
   action?: React.ReactNode;
   /** inline — sits inside a panel. page — fills a route. */
   size?: 'inline' | 'page';
   className?: string;
}

export function EmptyState({
   icon,
   title,
   description,
   action,
   size = 'inline',
   className,
}: EmptyStateProps): React.ReactElement {
   return (
      <div className={cx('ui-empty', `ui-empty--${size}`, className)}>
         {icon ? (
            <span className="ui-empty__icon" aria-hidden="true">
               {icon}
            </span>
         ) : null}
         <h3 className="ui-empty__title">{title}</h3>
         {description ? <p className="ui-empty__description">{description}</p> : null}
         {action ? <div className="ui-empty__action">{action}</div> : null}
      </div>
   );
}
