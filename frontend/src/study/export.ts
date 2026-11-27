/**
 * Export of study data: the versioned JSON backup and the per-collection Markdown study sheet,
 * plus small browser helpers to download or copy the result. Everything runs on the device.
 */
import { t } from '../i18n';
import { STUDY_EXPORT_FORMAT, STUDY_SCHEMA_VERSION, type StudyData, type StudyExportFile } from './schema';
import type { ResolvedVerse } from './verseText';

export function buildExportFile(data: StudyData, now: Date = new Date()): StudyExportFile {
   return { format: STUDY_EXPORT_FORMAT, version: STUDY_SCHEMA_VERSION, exportedAt: now.toISOString(), data };
}

/** Pretty-printed JSON backup of all study data. */
export function exportStudyJson(data: StudyData, now: Date = new Date()): string {
   return `${JSON.stringify(buildExportFile(data, now), null, 2)}\n`;
}

/** `bibliamap-study-2026-11-27.json`; `name` is slugified into the file name when given. */
export function exportFileName(extension: 'json' | 'md', name?: string, now: Date = new Date()): string {
   const date = now.toISOString().slice(0, 10);
   const slug = name
      ? name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48)
      : '';

   return `bibliamap-${slug || 'study'}-${date}.${extension}`;
}

export interface StudySheetVerse extends ResolvedVerse {
   /** The student's note on this verse. */
   note?: string;
}

export interface StudySheetInput {
   title: string;
   /** Collection note. */
   note?: string;
   verses: readonly StudySheetVerse[];
   /** Human name of the dataset the text comes from. */
   datasetTitle?: string;
   generatedAt?: Date;
}

/** Markdown blockquote: every line prefixed with `> `. */
function quote(text: string): string {
   return text.split('\n').map((line) => (line.trim() ? `> ${line}` : '>')).join('\n');
}

function formatDate(date: Date): string {
   return date.toLocaleDateString('en', { year: 'numeric', month: 'long', day: 'numeric' });
}

/** Builds the Markdown study sheet for one collection. */
export function buildStudySheet(input: StudySheetInput): string {
   const lines: string[] = [ `# ${input.title.trim() || t('study.sheet.untitled')}`, '' ];
   const meta = [ t('study.sheet.subtitle'), input.datasetTitle, formatDate(input.generatedAt ?? new Date()) ].filter(Boolean);

   lines.push(`_${meta.join(' · ')}_`, '');

   if (input.note?.trim()) {
      lines.push(input.note.trim(), '');
   }

   if (input.verses.length === 0) {
      lines.push(`_${t('study.sheet.empty')}_`, '');
   }

   for (const verse of input.verses) {
      lines.push(`## ${verse.label}`, '');
      lines.push(verse.text ? quote(verse.text) : `_${t('study.sheet.noText')}_`, '');

      if (verse.note?.trim()) {
         lines.push(`**${t('study.sheet.myNote')}**`, '', verse.note.trim(), '');
      }

      if (verse.connections?.length) {
         lines.push(`**${t('study.sheet.connected')}**`, '');
         verse.connections.forEach((connection) => {
            lines.push(connection.text ? `- **${connection.label}** — ${connection.text}` : `- **${connection.label}**`);
         });
         lines.push('');
      }
   }

   return `${lines.join('\n').trimEnd()}\n`;
}

/** Triggers a browser download of `content`. */
export function downloadText(fileName: string, content: string, mimeType: string): void {
   const blob = new Blob([ content ], { type: `${mimeType};charset=utf-8` });
   const url = URL.createObjectURL(blob);
   const anchor = document.createElement('a');

   anchor.href = url;
   anchor.download = fileName;
   anchor.rel = 'noopener';
   anchor.style.display = 'none';
   document.body.appendChild(anchor);
   anchor.click();
   anchor.remove();
   window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Copies text to the clipboard. Resolves `false` when the browser refuses. */
export async function copyText(text: string): Promise<boolean> {
   try {
      if (navigator.clipboard?.writeText) {
         await navigator.clipboard.writeText(text);
         return true;
      }
   } catch {
      // Fall through to the legacy path.
   }

   try {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
   } catch {
      return false;
   }
}
