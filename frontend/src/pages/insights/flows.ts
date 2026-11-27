import type { BookPair } from '../../graph/matrix';
import type { AdjacentEdge, EdgeKindFilter, SourceAdjacency } from '../../types/generated';

export interface FlowNode {
   bookNumber: number;
   value: number;
   /** Top edge and height of the node bar, in the diagram's units. */
   y: number;
   height: number;
}

export interface FlowLink {
   sourceBookNumber: number;
   targetBookNumber: number;
   weight: number;
   /** Vertical centre of the band where it leaves the source bar / enters the target bar. */
   sourceY: number;
   targetY: number;
   thickness: number;
}

export interface FlowLayout {
   sources: FlowNode[];
   targets: FlowNode[];
   links: FlowLink[];
}

export interface FlowLayoutOptions {
   height: number;
   /** Gap between node bars on the same side. */
   nodeGap?: number;
}

/**
 * Two-column flow (Sankey-style) layout: citing books on the left, cited books on the right,
 * both in canonical order, with band thickness proportional to the number of references.
 * Both columns share one scale so thickness is comparable across the whole diagram.
 */
export function layoutFlows(pairs: BookPair[], options: FlowLayoutOptions): FlowLayout {
   const { height, nodeGap = 6 } = options;
   const sourceTotals = new Map<number, number>();
   const targetTotals = new Map<number, number>();
   let total = 0;

   for (const pair of pairs) {
      sourceTotals.set(pair.sourceBookNumber, (sourceTotals.get(pair.sourceBookNumber) ?? 0) + pair.weight);
      targetTotals.set(pair.targetBookNumber, (targetTotals.get(pair.targetBookNumber) ?? 0) + pair.weight);
      total += pair.weight;
   }

   if (total === 0) {
      return { sources: [], targets: [], links: [] };
   }

   const columns = Math.max(sourceTotals.size, targetTotals.size);
   const scale = Math.max(0, height - nodeGap * (columns - 1)) / total;
   const place = (totals: Map<number, number>): FlowNode[] => {
      const entries = Array.from(totals.entries()).sort((left, right) => left[0] - right[0]);
      const used = total * scale + nodeGap * (entries.length - 1);
      let y = (height - used) / 2;

      return entries.map(([ bookNumber, value ]) => {
         const node = { bookNumber, value, y, height: value * scale };

         y += node.height + nodeGap;

         return node;
      });
   };
   const sources = place(sourceTotals);
   const targets = place(targetTotals);
   const sourceCursor = new Map(sources.map((node) => [ node.bookNumber, node.y ]));
   const targetCursor = new Map(targets.map((node) => [ node.bookNumber, node.y ]));
   const thicknessOf = (pair: BookPair): number => pair.weight * scale;
   const sourceY = new Map<BookPair, number>();
   const targetY = new Map<BookPair, number>();

   // Stack bands inside each bar ordered by the book at the other end, which minimises crossings.
   for (const pair of [ ...pairs ].sort(
      (left, right) => left.sourceBookNumber - right.sourceBookNumber || left.targetBookNumber - right.targetBookNumber,
   )) {
      const y = sourceCursor.get(pair.sourceBookNumber) ?? 0;

      sourceY.set(pair, y + thicknessOf(pair) / 2);
      sourceCursor.set(pair.sourceBookNumber, y + thicknessOf(pair));
   }

   for (const pair of [ ...pairs ].sort(
      (left, right) => left.targetBookNumber - right.targetBookNumber || left.sourceBookNumber - right.sourceBookNumber,
   )) {
      const y = targetCursor.get(pair.targetBookNumber) ?? 0;

      targetY.set(pair, y + thicknessOf(pair) / 2);
      targetCursor.set(pair.targetBookNumber, y + thicknessOf(pair));
   }

   return {
      sources,
      targets,
      links: pairs.map((pair) => ({
         sourceBookNumber: pair.sourceBookNumber,
         targetBookNumber: pair.targetBookNumber,
         weight: pair.weight,
         sourceY: sourceY.get(pair) ?? 0,
         targetY: targetY.get(pair) ?? 0,
         thickness: thicknessOf(pair),
      })),
   };
}

/** Horizontal cubic band between two columns (stroke it with `thickness`). */
export function flowLinkPath(x0: number, y0: number, x1: number, y1: number): string {
   const middle = (x0 + x1) / 2;

   return `M ${x0} ${y0.toFixed(2)} C ${middle} ${y0.toFixed(2)}, ${middle} ${y1.toFixed(2)}, ${x1} ${y1.toFixed(2)}`;
}

/** One reference from a verse in the source book to a verse (or range) in the target book. */
export interface VersePairEdge {
   source: number;
   targetStart: number;
   targetEnd: number;
   /** 0 = marginal cross reference, 1 = study-note reference. */
   kind: number;
}

/**
 * The verse pairs behind one cell of the book matrix: every edge in the source book's adjacency
 * file whose cited range starts in `targetBookNumber`. Sorted by source verse, then target.
 */
export function bookPairEdges(
   adjacency: SourceAdjacency,
   bookOf: (verseId: number) => number,
   targetBookNumber: number,
   kind: EdgeKindFilter = 'combined',
): VersePairEdge[] {
   const wantedKind = kind === 'crossrefs' ? 0 : kind === 'study-notes' ? 1 : null;
   const pairs: VersePairEdge[] = [];

   for (const bucket of Object.values(adjacency)) {
      for (const edge of bucket.outgoing as AdjacentEdge[]) {
         if ((wantedKind !== null && edge.kind !== wantedKind) || bookOf(edge.targetStart) !== targetBookNumber) {
            continue;
         }

         // Every edge is kept (no de-duplication) so the list length equals the matrix cell.
         pairs.push({
            source: edge.source,
            targetStart: edge.targetStart,
            targetEnd: Math.max(edge.targetEnd, edge.targetStart),
            kind: edge.kind,
         });
      }
   }

   return pairs.sort(
      (left, right) => left.source - right.source || left.targetStart - right.targetStart || left.kind - right.kind,
   );
}

/** One distinct verse pair, with how many references of each type back it. */
export interface VersePairGroup {
   source: number;
   targetStart: number;
   targetEnd: number;
   crossReferences: number;
   studyNotes: number;
}

/**
 * Collapses repeated edges between the same verses (the margin and one or more study notes
 * often cite the same verse) into one row. Input must be sorted as `bookPairEdges` returns it.
 */
export function groupVersePairs(edges: VersePairEdge[]): VersePairGroup[] {
   const groups: VersePairGroup[] = [];
   const byKey = new Map<string, VersePairGroup>();

   for (const edge of edges) {
      const key = `${edge.source}:${edge.targetStart}:${edge.targetEnd}`;
      let group = byKey.get(key);

      if (!group) {
         group = { source: edge.source, targetStart: edge.targetStart, targetEnd: edge.targetEnd, crossReferences: 0, studyNotes: 0 };
         byKey.set(key, group);
         groups.push(group);
      }

      if (edge.kind === 1) {
         group.studyNotes += 1;
      } else {
         group.crossReferences += 1;
      }
   }

   return groups;
}

/** Parses the `pair` query value (`"23-40"` = Isaiah → Matthew). */
export function parsePairParam(value: string | null): { source: number; target: number } | null {
   const match = value ? /^(\d{1,2})-(\d{1,2})$/.exec(value) : null;

   if (!match) {
      return null;
   }

   const source = Number(match[1]);
   const target = Number(match[2]);

   return source >= 1 && source <= 66 && target >= 1 && target <= 66 ? { source, target } : null;
}
