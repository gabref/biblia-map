import { useCountUp } from '../hooks/useCountUp';
import { formatNumber } from '../utils/format';

interface StatCardProps {
   label: string;
   value: number;
   detail?: string;
   icon: React.ReactNode;
}

export function StatCard({ label, value, detail, icon }: StatCardProps): React.ReactElement {
   const displayValue = useCountUp(value);

   return (
      <article className="stat-card">
         <p className="stat-card-label">
            <span className="stat-icon" aria-hidden="true">
               {icon}
            </span>
            {label}
         </p>
         {/* Screen readers get the final number, not every frame of the count-up. */}
         <strong aria-label={formatNumber(value)}>{formatNumber(displayValue)}</strong>
         {detail ? <span className="stat-card-detail">{detail}</span> : null}
      </article>
   );
}
