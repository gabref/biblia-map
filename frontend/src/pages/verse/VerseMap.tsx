import { useMemo } from 'react';

import type { EgoGraph, NeighborNode } from '../../graph/neighborhood';
import { computeLayout } from './layout';
import { VerseGraph, type VerseGraphProps } from './VerseGraph';

export interface VerseMapProps extends Omit<VerseGraphProps, 'layout'> {
   graph: EgoGraph;
   /** Label of the studied verse, drawn at the centre. */
   centerLabel: string;
   /** Short label drawn next to a node (abbreviated book name). */
   nodeLabel: (node: Pick<NeighborNode, 'verseId' | 'endVerseId'>) => string;
}

/**
 * Layout + drawing of the map. Loaded as its own chunk (see `VersePage`): the list, the studied
 * verse and the picker are usable before the graph code arrives.
 */
export default function VerseMap({ graph, centerLabel, nodeLabel, ...rest }: VerseMapProps): React.ReactElement {
   const layout = useMemo(() => computeLayout(graph, { centerLabel, label: nodeLabel }), [ centerLabel, graph, nodeLabel ]);

   return <VerseGraph layout={layout} {...rest} />;
}
