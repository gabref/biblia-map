import { Database } from 'lucide-react';

import type { DatasetRegistryEntry } from '../types/generated';

interface DatasetBadgeProps {
   datasets: DatasetRegistryEntry[];
   selectedDatasetId: string;
   onChange: (datasetId: string) => void;
}

export function DatasetBadge({
   datasets,
   selectedDatasetId,
   onChange,
}: DatasetBadgeProps): React.ReactElement {
   return (
      <div className="dataset-badge">
         <Database size={18} />
         <label>
            <span>Dataset</span>
            <select value={selectedDatasetId} onChange={(event) => onChange(event.target.value)}>
               {datasets.map((dataset) => (
                  <option key={dataset.datasetId} value={dataset.datasetId}>
                     {dataset.publicationSymbol} {dataset.publicationYear ?? ''}
                     {dataset.language === 'English' ? '' : ` (${dataset.language})`}
                  </option>
               ))}
            </select>
         </label>
      </div>
   );
}
