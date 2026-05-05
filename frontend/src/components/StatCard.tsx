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
         <div className="stat-icon">{icon}</div>
         <div>
            <p>{label}</p>
            <strong>{formatNumber(displayValue)}</strong>
            {detail ? <span>{detail}</span> : null}
         </div>
      </article>
   );
}
