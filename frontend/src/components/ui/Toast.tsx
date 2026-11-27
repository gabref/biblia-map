import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useT } from '../../i18n';
import { cx } from '../../lib/cx';

export type ToastTone = 'neutral' | 'success' | 'danger';

export interface ToastOptions {
   title: string;
   description?: string;
   tone?: ToastTone;
   /** Auto-dismiss after this many ms. 0 keeps it until dismissed. Default 4000. */
   duration?: number;
   /** One optional inline action, e.g. Undo. */
   action?: { label: string; onClick: () => void };
}

interface ToastRecord extends ToastOptions {
   id: number;
}

export interface ToastApi {
   /** Show a toast; returns its id. */
   toast: (options: ToastOptions | string) => number;
   dismiss: (id: number) => void;
}

const noopApi: ToastApi = { toast: () => -1, dismiss: () => undefined };
const ToastContext = createContext<ToastApi>(noopApi);
const MAX_VISIBLE = 3;

const toneIcons: Record<ToastTone, React.ReactNode> = {
   neutral: <Info size={16} />,
   success: <CheckCircle2 size={16} />,
   danger: <AlertTriangle size={16} />,
};

/** Mount once near the root. Renders the live region that toasts appear in. */
export function ToastProvider({ children }: { children: React.ReactNode }): React.ReactElement {
   const t = useT();
   const [ toasts, setToasts ] = useState<ToastRecord[]>([]);
   const nextIdRef = useRef(1);
   const timersRef = useRef(new Map<number, number>());

   const dismiss = useCallback((id: number): void => {
      window.clearTimeout(timersRef.current.get(id));
      timersRef.current.delete(id);
      setToasts((current) => current.filter((toast) => toast.id !== id));
   }, []);

   const toast = useCallback(
      (options: ToastOptions | string): number => {
         const id = nextIdRef.current++;
         const record: ToastRecord = typeof options === 'string' ? { id, title: options } : { id, ...options };
         const duration = record.duration ?? 4000;

         setToasts((current) => [ ...current, record ].slice(-MAX_VISIBLE));

         if (duration > 0) {
            timersRef.current.set(
               id,
               window.setTimeout(() => dismiss(id), duration),
            );
         }

         return id;
      },
      [ dismiss ],
   );

   useEffect(() => {
      const timers = timersRef.current;

      return () => timers.forEach((timer) => window.clearTimeout(timer));
   }, []);

   const api = useMemo(() => ({ toast, dismiss }), [ toast, dismiss ]);

   return (
      <ToastContext.Provider value={api}>
         {children}
         <div className="ui-toast-region" role="region" aria-label={t('shell.notifications')} aria-live="polite">
            {toasts.map((record) => {
               const tone = record.tone ?? 'neutral';

               return (
                  <div
                     key={record.id}
                     className={cx('ui-toast', `ui-toast--${tone}`)}
                     role={tone === 'danger' ? 'alert' : 'status'}
                  >
                     <span className="ui-toast__icon" aria-hidden="true">
                        {toneIcons[tone]}
                     </span>
                     <div className="ui-toast__body">
                        <strong>{record.title}</strong>
                        {record.description ? <span>{record.description}</span> : null}
                     </div>
                     {record.action ? (
                        <button
                           type="button"
                           className="ui-toast__action"
                           onClick={() => {
                              record.action?.onClick();
                              dismiss(record.id);
                           }}
                        >
                           {record.action.label}
                        </button>
                     ) : null}
                     <button
                        type="button"
                        className="ui-toast__close"
                        aria-label={t('shell.notifications.dismiss')}
                        onClick={() => dismiss(record.id)}
                     >
                        <X size={14} />
                     </button>
                  </div>
               );
            })}
         </div>
      </ToastContext.Provider>
   );
}

/** `const { toast } = useToast(); toast('Link copied')`. A no-op outside <ToastProvider>. */
export function useToast(): ToastApi {
   return useContext(ToastContext);
}
