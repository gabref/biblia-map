import { Download, HardDrive, Upload } from 'lucide-react';
import { useRef, useState } from 'react';

import { Button, Card, CardHeader, Sheet, useToast } from '../../components/ui';
import { useT, type MessageKey } from '../../i18n';
import { downloadText, exportFileName, exportStudyJson } from '../../study/export';
import { parseImportText, planImport, type ImportError, type ImportPlan } from '../../study/import';
import { plural } from '../../study/labels';
import { getStudyData, replaceStudyData, useStudyData, type StudyData } from '../../study/store';

const IMPORT_ERROR_KEYS: Record<ImportError, MessageKey> = {
   json: 'study.import.error.json',
   format: 'study.import.error.format',
   version: 'study.import.error.version',
   empty: 'study.import.error.empty',
};

/** Export all study data as JSON, and import a backup with merge after a confirmation. */
export function BackupPanel(): React.ReactElement {
   const t = useT();
   const { toast } = useToast();
   const data = useStudyData();
   const inputRef = useRef<HTMLInputElement | null>(null);
   const [ pending, setPending ] = useState<{ plan: ImportPlan; incoming: StudyData; dropped: number; fileName: string } | null>(null);
   const [ error, setError ] = useState<ImportError | null>(null);

   const totals = {
      collections: data.collections.length,
      verses: data.bookmarks.length,
      notes: Object.keys(data.notes).length + data.collections.filter((collection) => collection.note).length,
   };

   const handleExport = (): void => {
      downloadText(exportFileName('json'), exportStudyJson(getStudyData()), 'application/json');
      toast({ title: t('study.backup.exported'), tone: 'success' });
   };

   const handleFile = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
      const file = event.target.files?.[0];
      event.target.value = '';

      if (!file) {
         return;
      }

      setError(null);
      const parsed = parseImportText(await file.text());

      if (!parsed.ok) {
         setError(parsed.error);
         return;
      }

      setPending({ plan: planImport(getStudyData(), parsed.data, parsed.dropped), incoming: parsed.data, dropped: parsed.dropped, fileName: file.name });
   };

   const handleConfirm = (): void => {
      if (!pending) {
         return;
      }

      // Re-plan against the latest data in case another tab changed it meanwhile.
      const latest = planImport(getStudyData(), pending.incoming, pending.dropped);
      replaceStudyData(latest.next);
      setPending(null);
      toast({ title: t('study.backup.imported'), tone: 'success' });
   };

   const summary = pending?.plan.summary;
   const summaryLines = summary
      ? [
         summary.collectionsAdded ? plural('study.import.collections', summary.collectionsAdded) : null,
         summary.bookmarksAdded ? plural('study.import.bookmarks', summary.bookmarksAdded) : null,
         summary.notesAdded ? plural('study.import.notes', summary.notesAdded) : null,
         summary.notesMerged ? plural('study.import.notesMerged', summary.notesMerged) : null,
         summary.historyAdded ? plural('study.import.history', summary.historyAdded) : null,
      ].filter((line): line is string => line !== null)
      : [];

   return (
      <Card as="section" aria-labelledby="study-backup-title" className="study-panel">
         <CardHeader
            title={<span id="study-backup-title">{t('study.backup.title')}</span>}
            description={t('study.backup.description')}
            icon={<HardDrive size={18} />}
         />
         <p className="study-backup__totals t-caption">
            {[ plural('study.backup.totalCollections', totals.collections), plural('study.backup.totalVerses', totals.verses), plural('study.backup.totalNotes', totals.notes) ].join(' · ')}
         </p>
         <div className="study-backup__actions">
            <Button leading={<Download size={15} aria-hidden="true" />} onClick={handleExport}>
               {t('study.backup.export')}
            </Button>
            <Button leading={<Upload size={15} aria-hidden="true" />} onClick={() => inputRef.current?.click()}>
               {t('study.backup.import')}
            </Button>
            <input
               ref={inputRef}
               type="file"
               accept="application/json,.json"
               className="visually-hidden"
               tabIndex={-1}
               aria-hidden="true"
               onChange={(event) => void handleFile(event)}
            />
         </div>
         {error ? (
            <p className="study-error" role="alert">
               {t(IMPORT_ERROR_KEYS[error])}
            </p>
         ) : null}
         <Sheet
            open={pending !== null}
            onClose={() => setPending(null)}
            side="center"
            size="sm"
            title={t('study.import.confirmTitle')}
            description={pending ? t('study.import.confirmBody', { file: pending.fileName }) : undefined}
            footer={(
               <>
                  <Button variant="ghost" onClick={() => setPending(null)}>{t('study.common.cancel')}</Button>
                  <Button variant="primary" disabled={summary?.nothingNew} onClick={handleConfirm}>
                     {t('study.import.confirm')}
                  </Button>
               </>
            )}
         >
            {summary?.nothingNew ? (
               <p>{t('study.import.nothingNew')}</p>
            ) : (
               <ul className="study-import__summary">
                  {summaryLines.map((line) => <li key={line}>{line}</li>)}
               </ul>
            )}
            {summary?.dropped ? <p className="t-caption">{plural('study.import.dropped', summary.dropped)}</p> : null}
            <p className="t-caption">{t('study.import.mergeNote')}</p>
         </Sheet>
      </Card>
   );
}
