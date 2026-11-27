import { Database } from 'lucide-react';

import type { DatasetRegistryEntry } from '../types/generated';

interface DatasetBadgeProps {
   datasets: DatasetRegistryEntry[];
   selectedDatasetId: string;
   onChange: (datasetId: string) => void;
}

/** Edition switcher. The full publication title is exposed as the control's tooltip. */
export function DatasetBadge({
   datasets,
   selectedDatasetId,
   onChange,
}: DatasetBadgeProps): React.ReactElement {
   const selected = datasets.find((dataset) => dataset.datasetId === selectedDatasetId);

   return (
      <div className="dataset-badge">
         <Database size={18} aria-hidden="true" />
         <label>
            <span>Dataset</span>
            <select
               value={selectedDatasetId}
               title={selected?.publicationTitle}
               onChange={(event) => onChange(event.target.value)}
            >
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
