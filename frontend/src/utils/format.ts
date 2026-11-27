// Constructing an Intl.NumberFormat is expensive; list views format thousands of values per render.
const numberFormatter = new Intl.NumberFormat('en-US');

export function formatNumber(value: number): string {
   return numberFormatter.format(value);
}

/**
 * Formats `value / total` as a whole percentage.
 *
 * Plain rounding misreports the extremes: 3 of 31,078 verses rounds to "0%" and 31,070 of 31,078
 * rounds to "100%" even though the share is neither none nor all. Those cases render as "<1%" and
 * ">99%" instead.
 */
export function formatPercent(value: number, total: number): string {
   if (total === 0 || value <= 0) {
      return '0%';
   }

   if (value >= total) {
      return '100%';
   }

   const percent = (value / total) * 100;

   if (percent < 1) {
      return '<1%';
   }

   if (percent > 99) {
      return '>99%';
   }

   return `${Math.round(percent)}%`;
}

export function edgeKindLabel(kind: number): string {
   if (kind === 0) {
      return 'Cross reference';
   }

   if (kind === 1) {
      return 'Study note';
   }

   return 'Footnote';
}
