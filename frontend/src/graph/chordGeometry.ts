export interface Point {
   x: number;
   y: number;
}

export interface AngleSpan {
   startAngle: number;
   endAngle: number;
}

/** Point on a circle; angle 0 is 12 o'clock, increasing clockwise (the d3-chord convention). */
export function polarPoint(radius: number, angle: number): Point {
   return {
      x: Math.cos(angle - Math.PI / 2) * radius,
      y: Math.sin(angle - Math.PI / 2) * radius,
   };
}

export function midAngle(span: AngleSpan): number {
   return (span.startAngle + span.endAngle) / 2;
}

export interface RadialLabel {
   /** SVG `transform` placing the text at `radius`, reading outward and never upside down. */
   transform: string;
   anchor: 'start' | 'end';
}

/** Placement for a label that runs along the radius just outside an arc. */
export function radialLabel(angle: number, radius: number): RadialLabel {
   const degrees = (angle * 180) / Math.PI - 90;
   const flipped = angle > Math.PI;

   return {
      transform: `rotate(${degrees.toFixed(2)}) translate(${radius},0)${flipped ? ' rotate(180)' : ''}`,
      anchor: flipped ? 'end' : 'start',
   };
}

/** Whether an arc is wide enough to carry a radial label `lineHeight` tall at `radius`. */
export function arcFitsLabel(span: AngleSpan, radius: number, lineHeight: number): boolean {
   return (span.endAngle - span.startAngle) * radius >= lineHeight;
}

/**
 * Merges consecutive groups that share a key into one span each, e.g. the 66 book arcs into the
 * seven canon sections of the outer ring. Groups with no angular extent are skipped.
 */
export function mergeSpans<TKey>(
   groups: Array<AngleSpan & { index: number }>,
   keyOf: (index: number) => TKey,
): Array<AngleSpan & { key: TKey }> {
   const spans: Array<AngleSpan & { key: TKey }> = [];

   for (const group of groups) {
      if (group.endAngle <= group.startAngle) {
         continue;
      }

      const key = keyOf(group.index);
      const last = spans[spans.length - 1];

      if (last && last.key === key) {
         last.endAngle = group.endAngle;
      } else {
         spans.push({ key, startAngle: group.startAngle, endAngle: group.endAngle });
      }
   }

   return spans;
}

/**
 * Circular arc path at a fixed radius, for outer rings and `textPath`s. Clockwise by default;
 * `reverse` draws it counter-clockwise so text on the lower half of a circle reads left to right.
 */
export function ringPath(radius: number, startAngle: number, endAngle: number, reverse = false): string {
   const from = polarPoint(radius, reverse ? endAngle : startAngle);
   const to = polarPoint(radius, reverse ? startAngle : endAngle);
   const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;

   return `M ${from.x.toFixed(2)} ${from.y.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} ${reverse ? 0 : 1} ${to.x.toFixed(2)} ${to.y.toFixed(2)}`;
}

/** True when the middle of a span sits on the lower half of the circle. */
export function isLowerHalf(span: AngleSpan): boolean {
   const angle = midAngle(span) % (2 * Math.PI);

   return angle > Math.PI / 2 && angle < (3 * Math.PI) / 2;
}
