import type { Book, CompactEdges, VerseIndex } from '../types/generated';

export interface RelationshipBookCount {
   bookNumber: number;
   name: string;
   count: number;
}

export interface RelationshipComponent {
   id: number;
   size: number;
   percent: number;
   edgeCount: number;
   sampleVerses: string[];
   topBooks: RelationshipBookCount[];
}

export interface RelationshipComponentsSummary {
   totalVerses: number;
   totalEdges: number;
   blockCount: number;
   isolatedVerses: number;
   largestBlock: RelationshipComponent | null;
   components: RelationshipComponent[];
}

interface ComponentDraft {
   size: number;
   edgeCount: number;
   sampleVerses: string[];
   bookCounts: Map<number, number>;
}

export function buildRelationshipComponents(
   verseIndex: VerseIndex,
   edges: CompactEdges,
   books: Book[],
): RelationshipComponentsSummary {
   const verseIds = Object.keys(verseIndex)
      .map(Number)
      .sort((left, right) => left - right);
   const versePosition = new Map(verseIds.map((verseId, index) => [ verseId, index ]));
   const disjointSet = new DisjointSet(verseIds.length);

   for (let edgeIndex = 0; edgeIndex < edges.source.length; edgeIndex += 1) {
      const sourceIndex = versePosition.get(edges.source[edgeIndex]);

      if (sourceIndex === undefined) {
         continue;
      }

      for (
         let targetVerseId = edges.targetStart[edgeIndex];
         targetVerseId <= edges.targetEnd[edgeIndex];
         targetVerseId += 1
      ) {
         const targetIndex = versePosition.get(targetVerseId);

         if (targetIndex !== undefined) {
            disjointSet.union(sourceIndex, targetIndex);
         }
      }
   }

   const drafts = new Map<number, ComponentDraft>();

   for (const verseId of verseIds) {
      const root = disjointSet.find(versePosition.get(verseId) ?? 0);
      const verse = verseIndex[String(verseId)];
      const draft = drafts.get(root) ?? {
         size: 0,
         edgeCount: 0,
         sampleVerses: [],
         bookCounts: new Map<number, number>(),
      };

      draft.size += 1;
      draft.bookCounts.set(verse.bookNumber, (draft.bookCounts.get(verse.bookNumber) ?? 0) + 1);

      if (draft.sampleVerses.length < 4) {
         draft.sampleVerses.push(verse.label);
      }

      drafts.set(root, draft);
   }

   for (let edgeIndex = 0; edgeIndex < edges.source.length; edgeIndex += 1) {
      const sourceIndex = versePosition.get(edges.source[edgeIndex]);

      if (sourceIndex === undefined) {
         continue;
      }

      drafts.get(disjointSet.find(sourceIndex))!.edgeCount += 1;
   }

   const totalVerses = verseIds.length;
   const bookNameByNumber = new Map(books.map((book) => [ book.bookNumber, book.name ]));
   const components = Array.from(drafts.values())
      .map((draft) => ({
         id: 0,
         size: draft.size,
         percent: totalVerses > 0 ? draft.size / totalVerses : 0,
         edgeCount: draft.edgeCount,
         sampleVerses: draft.sampleVerses,
         topBooks: Array.from(draft.bookCounts.entries())
            .map(([ bookNumber, count ]) => ({
               bookNumber,
               name: bookNameByNumber.get(bookNumber) ?? `Book ${bookNumber}`,
               count,
            }))
            .sort((left, right) => right.count - left.count || left.bookNumber - right.bookNumber)
            .slice(0, 5),
      }))
      .sort((left, right) => right.size - left.size || right.edgeCount - left.edgeCount)
      .map((component, index) => ({ ...component, id: index + 1 }));

   return {
      totalVerses,
      totalEdges: edges.source.length,
      blockCount: components.length,
      isolatedVerses: components.filter((component) => component.size === 1).length,
      largestBlock: components[0] ?? null,
      components,
   };
}

class DisjointSet {
   private readonly parent: number[];
   private readonly rank: number[];

   public constructor(size: number) {
      this.parent = Array.from({ length: size }, (_, index) => index);
      this.rank = Array.from({ length: size }, () => 0);
   }

   public find(index: number): number {
      const parent = this.parent[index];

      if (parent !== index) {
         this.parent[index] = this.find(parent);
      }

      return this.parent[index];
   }

   public union(left: number, right: number): void {
      const leftRoot = this.find(left);
      const rightRoot = this.find(right);

      if (leftRoot === rightRoot) {
         return;
      }

      if (this.rank[leftRoot] < this.rank[rightRoot]) {
         this.parent[leftRoot] = rightRoot;
         return;
      }

      if (this.rank[leftRoot] > this.rank[rightRoot]) {
         this.parent[rightRoot] = leftRoot;
         return;
      }

      this.parent[rightRoot] = leftRoot;
      this.rank[leftRoot] += 1;
   }
}
