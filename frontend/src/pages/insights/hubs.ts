import type { CompactEdges, EdgeKindFilter, Testament, VerseDegree } from '../../types/generated';
import type { VerseLocationRef, VerseLocator } from './locator';

/**
 * Per-verse degree arrays indexed by `jwpubVerseId`: `stats.verse-degree.json` (`VerseDegree`), or
 * the typed arrays counted client-side when a dataset has no such file. `in`/`out` count marginal
 * cross references, `inStudy`/`outStudy` study-note references; a cited range counts once for
 * every verse it covers.
 */
export type VerseDegrees = Pick<VerseDegree, 'length'> & Record<'in' | 'out' | 'inStudy' | 'outStudy', ArrayLike<number>>;

/** Client-side equivalent of `stats.verse-degree.json`, for datasets generated without it. */
export function computeVerseDegrees(
   edges: Pick<CompactEdges, 'source' | 'targetStart' | 'targetEnd' | 'kind'>,
   locator: Pick<VerseLocator, 'idSpace' | 'forEachVerse'>,
): VerseDegrees {
   const length = locator.idSpace;
   const isVerse = new Uint8Array(length);
   const degrees = {
      length,
      in: new Uint32Array(length),
      out: new Uint32Array(length),
      inStudy: new Uint32Array(length),
      outStudy: new Uint32Array(length),
   };

   locator.forEachVerse((verseId) => {
      isVerse[verseId] = 1;
   });

   for (let index = 0; index < edges.source.length; index += 1) {
      const study = edges.kind[index] === 1;
      const source = edges.source[index];

      if (source >= 0 && source < length) {
         (study ? degrees.outStudy : degrees.out)[source] += 1;
      }

      const end = Math.max(edges.targetEnd[index], edges.targetStart[index]);

      for (let target = edges.targetStart[index]; target <= end; target += 1) {
         if (target >= 0 && target < length && isVerse[target] === 1) {
            (study ? degrees.inStudy : degrees.in)[target] += 1;
         }
      }
   }

   return degrees;
}

/**
 * - `referenced`: verses cited the most (in-degree).
 * - `referring`: verses that cite the most (out-degree).
 * - `study`: verses cited the most by study notes.
 */
export type HubMetric = 'referenced' | 'referring' | 'study';

export interface HubRow extends VerseLocationRef {
   /** The ranked value for the chosen metric and reference type. */
   value: number;
   /** Times cited / citing, for the chosen reference type (shown next to the ranked value). */
   incoming: number;
   outgoing: number;
}

export interface HubOptions {
   metric: HubMetric;
   kind?: EdgeKindFilter;
   bookNumber?: number;
   testament?: Testament;
   limit?: number;
}

export function incomingDegree(degrees: VerseDegrees, verseId: number, kind: EdgeKindFilter = 'combined'): number {
   const cross = kind === 'study-notes' ? 0 : degrees.in[verseId] ?? 0;
   const study = kind === 'crossrefs' ? 0 : degrees.inStudy[verseId] ?? 0;

   return cross + study;
}

export function outgoingDegree(degrees: VerseDegrees, verseId: number, kind: EdgeKindFilter = 'combined'): number {
   const cross = kind === 'study-notes' ? 0 : degrees.out[verseId] ?? 0;
   const study = kind === 'crossrefs' ? 0 : degrees.outStudy[verseId] ?? 0;

   return cross + study;
}

/** Top verses by degree, largest first (ties: canonical order). Verses with a zero value are dropped. */
export function rankHubs(degrees: VerseDegrees, locator: VerseLocator, options: HubOptions): HubRow[] {
   const { metric, kind = 'combined', bookNumber, testament, limit = 100 } = options;
   const rows: HubRow[] = [];

   locator.forEachVerse((verseId, run) => {
      if (bookNumber !== undefined && run.bookNumber !== bookNumber) {
         return;
      }

      if (testament !== undefined && (run.bookNumber <= 39 ? 'OT' : 'NT') !== testament) {
         return;
      }

      const incoming = incomingDegree(degrees, verseId, kind);
      const outgoing = outgoingDegree(degrees, verseId, kind);
      const value = metric === 'referenced' ? incoming : metric === 'referring' ? outgoing : degrees.inStudy[verseId] ?? 0;

      if (value > 0) {
         rows.push({
            jwpubVerseId: verseId,
            bookNumber: run.bookNumber,
            chapterNumber: run.chapterNumber,
            verseNumber: run.firstVerseNumber + (verseId - run.firstId),
            value,
            incoming,
            outgoing,
         });
      }
   });

   rows.sort((left, right) => right.value - left.value || left.jwpubVerseId - right.jwpubVerseId);

   return rows.slice(0, limit);
}

/** True when any verse has a study-note reference (decides whether the study tab is offered). */
export function hasStudyDegrees(degrees: VerseDegrees): boolean {
   for (let index = 0; index < degrees.length; index += 1) {
      if ((degrees.inStudy[index] ?? 0) > 0 || (degrees.outStudy[index] ?? 0) > 0) {
         return true;
      }
   }

   return false;
}
