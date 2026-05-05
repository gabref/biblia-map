export function formatNumber(value: number): string {
   return new Intl.NumberFormat('en-US').format(value);
}

export function formatPercent(value: number, total: number): string {
   if (total === 0) {
      return '0%';
   }

   return `${Math.round((value / total) * 100)}%`;
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
