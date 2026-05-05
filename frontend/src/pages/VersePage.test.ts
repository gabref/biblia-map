import { describe, expect, it } from 'vitest';
import { forceLink, forceSimulation } from 'd3-force';

import { buildForceGraph, buildRelatedNodes } from './VersePage';

describe('buildRelatedNodes', () => {
   it('groups outgoing edges by target verse and applies edge-kind filters', () => {
      const nodes = buildRelatedNodes({
         selectedVerseId: 100,
         direction: 'outgoing',
         edgeKind: 'crossrefs',
         adjacency: {
            '100': {
               outgoing: [
                  {
                     source: 100,
                     targetStart: 200,
                     targetEnd: 200,
                     kind: 0,
                  },
                  {
                     source: 100,
                     targetStart: 200,
                     targetEnd: 200,
                     kind: 0,
                  },
                  {
                     source: 100,
                     targetStart: 300,
                     targetEnd: 300,
                     kind: 1,
                  },
               ],
            },
         },
         verseIndex: {
            '200': {
               jwpubVerseId: 200,
               canonicalVerseId: 45_012_012,
               bookNumber: 45,
               chapterNumber: 12,
               verseNumber: 12,
               label: 'Romans 12:12',
            },
         },
      });

      expect(nodes).toHaveLength(1);
      expect(nodes[0]).toMatchObject({
         verseId: 200,
         label: 'Romans 12:12',
         count: 2,
      });
   });
});

describe('buildForceGraph', () => {
   it('uses link ids that d3-force can resolve without throwing', () => {
      const graph = buildForceGraph(
         {
            jwpubVerseId: 100,
            canonicalVerseId: 45_012_012,
            bookNumber: 45,
            chapterNumber: 12,
            verseNumber: 12,
            label: 'Romans 12:12',
         },
         [
            {
               verseId: 200,
               label: 'Romans 12:13',
               depth: 1,
               incomingCount: 0,
               outgoingCount: 1,
               edges: [],
            },
         ],
         [
            {
               source: 100,
               target: 200,
               direction: 'outgoing',
               kind: 0,
               edge: {
                  source: 100,
                  targetStart: 200,
                  targetEnd: 200,
                  kind: 0,
               },
            },
         ],
      );

      expect(() => {
         forceSimulation(graph.nodes)
            .force(
               'link',
               forceLink<(typeof graph.nodes)[number], (typeof graph.links)[number]>(graph.links).id((node) =>
                  String(node.verseId),
               ),
            )
            .tick(1)
            .stop();
      }).not.toThrow();
   });
});
