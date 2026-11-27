import { Copy, Download } from 'lucide-react';
import { useState } from 'react';

import { Button, Field, Select, Sheet, Skeleton } from '../../components/ui';
import { useT } from '../../i18n';
import { buildStudySheet, copyText, downloadText, exportFileName } from '../../study/export';
import { collectionDisplayName } from '../../study/labels';
import { getCollectionNote, getNote, type Bookmark, type Collection } from '../../study/store';
import { resolvedKey, useDatasets, useResolvedVerses } from './useResolvedVerses';

interface SheetExportDialogProps {
   open: boolean;
   onClose: () => void;
   collection: Collection;
   items: readonly Bookmark[];
   datasetId: string;
}

type ConnectionChoice = '0' | '3' | '5';

/** Markdown study sheet export: pick the dataset and connected verses, preview, download or copy. */
export function SheetExportDialog(props: SheetExportDialogProps): React.ReactElement {
   const t = useT();

   return (
      <Sheet
         open={props.open}
         onClose={props.onClose}
         side="responsive"
         size="lg"
         title={t('study.sheet.title')}
         description={t('study.sheet.description')}
      >
         {props.open ? <SheetExportBody {...props} /> : null}
      </Sheet>
   );
}

function SheetExportBody({ onClose, collection, items, datasetId: initialDataset }: SheetExportDialogProps): React.ReactElement {
   const t = useT();
   const [ copyState, setCopyState ] = useState<'idle' | 'copied' | 'failed'>('idle');
   const datasets = useDatasets();
   const [ datasetId, setDatasetId ] = useState(initialDataset);
   const [ connections, setConnections ] = useState<ConnectionChoice>('0');
   const [ includeNotes, setIncludeNotes ] = useState(true);
   const verses = useResolvedVerses(datasetId, items, Number(connections));
   const dataset = datasets.data?.find((item) => item.datasetId === datasetId);
   const title = collectionDisplayName(collection);

   const markdown = verses.data && !verses.isStale
      ? buildStudySheet({
         title,
         note: includeNotes ? getCollectionNote(collection.id) : undefined,
         datasetTitle: dataset?.publicationTitle,
         verses: items.flatMap((item) => {
            const resolved = verses.data?.get(resolvedKey(item));

            return resolved ? [ { ...resolved, note: includeNotes ? getNote(item.key) : undefined } ] : [];
         }),
      })
      : null;

   const datasetOptions = (datasets.data ?? [ { datasetId, publicationTitle: datasetId } ]).map((item) => ({
      value: item.datasetId,
      label: item.publicationTitle,
   }));

   const handleCopy = async (): Promise<void> => {
      // Toasts render under open dialogs, so feedback is shown inline.
      setCopyState(markdown && (await copyText(markdown)) ? 'copied' : 'failed');
   };

   return (
      <div className="study-sheet">
         <div className="study-sheet__options">
            <Field label={t('study.sheet.dataset')}>
               {(id) => <Select id={id} value={datasetId} options={datasetOptions} onChange={setDatasetId} />}
            </Field>
            <Field label={t('study.sheet.connections')} hint={t('study.sheet.connectionsHint')}>
               {(id) => (
                  <Select<ConnectionChoice>
                     id={id}
                     value={connections}
                     onChange={setConnections}
                     options={[
                        { value: '0', label: t('study.sheet.connectionsNone') },
                        { value: '3', label: t('study.sheet.connectionsTop', { count: 3 }) },
                        { value: '5', label: t('study.sheet.connectionsTop', { count: 5 }) },
                     ]}
                  />
               )}
            </Field>
            <label className="study-check">
               <input type="checkbox" checked={includeNotes} onChange={(event) => setIncludeNotes(event.target.checked)} />
               {t('study.sheet.includeNotes')}
            </label>
         </div>
         <p className="t-eyebrow">{t('study.sheet.preview')}</p>
         {verses.error ? (
            <p className="study-error" role="alert">{t('study.sheet.loadFailed')}</p>
         ) : markdown ? (
            <pre className="study-sheet__preview" tabIndex={0} aria-label={t('study.sheet.preview')}>{markdown}</pre>
         ) : (
            <div role="status" aria-label={t('study.sheet.loading')} className="study-sheet__preview">
               <Skeleton lines={6} />
            </div>
         )}
         <div className="study-sheet__actions">
            <span className="study-sheet__feedback" role="status">
               {copyState === 'copied' ? t('study.sheet.copied') : copyState === 'failed' ? t('study.sheet.copyFailed') : ''}
            </span>
            <Button variant="ghost" onClick={onClose}>{t('study.common.close')}</Button>
            <Button leading={<Copy size={15} aria-hidden="true" />} disabled={!markdown} onClick={() => void handleCopy()}>
               {t('study.sheet.copy')}
            </Button>
            <Button
               variant="primary"
               leading={<Download size={15} aria-hidden="true" />}
               disabled={!markdown}
               onClick={() => markdown && downloadText(exportFileName('md', title), markdown, 'text/markdown')}
            >
               {t('study.sheet.download')}
            </Button>
         </div>
      </div>
   );
}
