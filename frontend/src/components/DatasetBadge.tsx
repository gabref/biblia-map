import { Database } from 'lucide-react';

import { loadManifest } from '../data/generated';
import { useAsyncData } from '../hooks/useAsyncData';

export function DatasetBadge(): React.ReactElement {
   const { data: manifest } = useAsyncData(loadManifest, []);

   return (
      <div className="dataset-badge">
         <Database size={18} />
         <span>
            <strong>{manifest?.publicationSymbol ?? 'nwtsty'}</strong>
            <small>{manifest?.publicationYear ?? 'generated'}</small>
         </span>
      </div>
   );
}
