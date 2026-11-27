import type { ChapterBookCount, ChapterMatrix } from '../../types/generated';

/** One row of `stats.chapters.json`. */
export interface ChapterStat {
   bookNumber: number;
   chapterNumber: number;
   label: string;
   outgoing: number;
   incoming: number;
}

export type HeatmapMetric = 'total' | 'incoming' | 'outgoing';

export function chapterValue(stat: Pick<ChapterStat, 'incoming' | 'outgoing'>, metric: HeatmapMetric): number {
   if (metric === 'incoming') {
      return stat.incoming;
   }

   if (metric === 'outgoing') {
      return stat.outgoing;
   }

   return stat.incoming + stat.outgoing;
}

/**
 * Upper bounds of `steps` colour classes chosen at quantiles of the non-zero values, so every
 * class holds a similar number of chapters. A linear scale would be dominated by a few very
 * dense chapters and leave the rest of the grid one flat colour. Bounds are strictly increasing.
 */
export function quantileThresholds(values: number[], steps: number): number[] {
   const sorted = values.filter((value) => value > 0).sort((left, right) => left - right);

   if (sorted.length === 0 || steps < 1) {
      return [];
   }

   const thresholds: number[] = [];

   for (let step = 1; step <= steps; step += 1) {
      const index = Math.min(sorted.length - 1, Math.ceil((step / steps) * sorted.length) - 1);
      const value = sorted[index];

      if (thresholds.length === 0 || value > thresholds[thresholds.length - 1]) {
         thresholds.push(value);
      }
   }

   return thresholds;
}

/** Colour class of a value: 0 = no references, 1…n = the first threshold it does not exceed. */
export function bucketOf(value: number, thresholds: number[]): number {
   if (value <= 0 || thresholds.length === 0) {
      return 0;
   }

   for (let index = 0; index < thresholds.length; index += 1) {
      if (value <= thresholds[index]) {
         return index + 1;
      }
   }

   return thresholds.length;
}

export interface LegendStop {
   bucket: number;
   /** Inclusive value range of the class. */
   from: number;
   to: number;
}

/** Legend entries for the classes produced by `quantileThresholds`. */
export function legendStops(thresholds: number[], integer: boolean): LegendStop[] {
   const step = integer ? 1 : 0;

   return thresholds.map((to, index) => ({
      bucket: index + 1,
      from: index === 0 ? (integer ? 1 : 0) : thresholds[index - 1] + step,
      to,
   }));
}

interface AdjacencyEdgeLike {
   source: number;
   targetStart: number;
   targetEnd?: number;
   kind: number;
   commentaryId?: number | null;
}

/**
 * Builds the same aggregate from a book's adjacency files, for datasets generated without
 * chapter matrices. Same raw basis as the file: cross references and study-note references are
 * counted separately and `combined` is their sum. Each edge counts once, attributed to the chapter of its source verse
 * (outgoing) or of the start of its cited range (incoming).
 */
export function chapterMatrixFromAdjacency(
   bookNumber: number,
   chapters: number,
   outgoingEdges: Iterable<AdjacencyEdgeLike>,
   incomingEdges: Iterable<AdjacencyEdgeLike>,
   locate: (verseId: number) => { bookNumber: number; chapterNumber: number } | null,
): ChapterMatrix {
   const collect = (edges: Iterable<AdjacencyEdgeLike>, outgoingSide: boolean): ChapterMatrix['outgoing'] => {
      const perChapter = Array.from({ length: chapters }, () => new Map<number, [ number, number ]>());
      const seen = new Set<string>();

      for (const edge of edges) {
         const source = locate(edge.source);
         const target = locate(edge.targetStart);
         const own = outgoingSide ? source : target;
         const other = outgoingSide ? target : source;

         if (!own || !other || own.bookNumber !== bookNumber || own.chapterNumber > chapters) {
            continue;
         }

         // Target adjacency lists a ranged edge under every verse of the range: count it once.
         const key = `${edge.source}:${edge.targetStart}:${edge.targetEnd ?? ''}:${edge.kind}:${edge.commentaryId ?? ''}`;

         if (seen.has(key)) {
            continue;
         }

         seen.add(key);

         const counts = perChapter[own.chapterNumber - 1];
         const entry = counts.get(other.bookNumber) ?? [ 0, 0 ];

         entry[edge.kind === 1 ? 1 : 0] += 1;
         counts.set(other.bookNumber, entry);
      }

      return perChapter.map((counts) =>
         Array.from(counts.entries())
            .sort((left, right) => left[0] - right[0])
            .map(([ other, [ cross, study ] ]): ChapterBookCount => [ other, cross, study, cross + study ]),
      );
   };

   return {
      bookNumber,
      chapters,
      outgoing: collect(outgoingEdges, true),
      incoming: collect(incomingEdges, false),
   };
}
