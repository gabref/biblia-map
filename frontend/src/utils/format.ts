/**
 * Formatting helpers in the current UI locale (see i18n). These read the locale but do not
 * subscribe to it: inside components prefer `useFormat()` from `../i18n`, which re-renders
 * when the language changes.
 */
import { formatNumberIn, formatPercentIn, getLocale, t } from '../i18n';

export function formatNumber(value: number): string {
   return formatNumberIn(getLocale(), value);
}

/**
 * Formats `value / total` as a whole percentage.
 *
 * Plain rounding misreports the extremes: 3 of 31,078 verses rounds to "0%" and 31,070 of 31,078
 * rounds to "100%" even though the share is neither none nor all. Those cases render as "<1%" and
 * ">99%" instead.
 */
export function formatPercent(value: number, total: number): string {
   return formatPercentIn(getLocale(), value, total);
}

export function edgeKindLabel(kind: number): string {
   if (kind === 0) {
      return t('shell.edgeKind.crossref');
   }

   if (kind === 1) {
      return t('shell.edgeKind.studyNote');
   }

   return t('shell.edgeKind.footnote');
}
