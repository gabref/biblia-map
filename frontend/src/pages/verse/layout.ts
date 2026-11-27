/**
 * Deterministic radial layout of the ego graph. Position encodes direction: verses the
 * studied verse cites sit on the right, verses citing it on the left, verses linked both
 * ways on the vertical axis. Second-hop verses form an outer band next to the first-hop
 * verses they are reached through.
 *
 * Because it is a pure function of the graph there is no simulation, no per-tick React
 * render and no random start: the same verse always draws the same picture, and moving to
 * another verse can tween every surviving node from its old position to its new one.
 */
import type { EgoGraph, EgoLink, NeighborNode, NodeDirection } from '../../graph/neighborhood';

export interface LayoutNode {
   key: string;
   x: number;
   y: number;
   r: number;
   depth: 0 | 1 | 2;
   direction: NodeDirection | 'center';
   /** Where the label goes: 1 right of the node, -1 left, 0 below (centre). */
   side: -1 | 0 | 1;
   label: string;
   /** Node a newly drawn node grows out of (the centre, or a first-hop parent). */
   parentKey: string | null;
}

export interface Bounds {
   minX: number;
   maxX: number;
   minY: number;
   maxY: number;
}

export interface GraphLayout {
   centerKey: string;
   nodes: LayoutNode[];
   links: EgoLink[];
   index: Map<string, LayoutNode>;
   /** Keys directly linked to each node (for focus + context highlighting). */
   neighbors: Map<string, Set<string>>;
   bounds: Bounds;
}

export const CENTER_RADIUS = 13;
const FIRST_RADIUS = 205;
const ARC_GAP = 125;
const SECOND_GAP = 150;
const ROW = 16;
const ROW_SECOND = 13;
const MAX_PER_ARC = 44;
const MAX_PER_SECOND_ARC = 56;
const BOTH_START = 92;
const BOTH_STEP = 24;

/** Horizontal reach of an arc at relative height `t` (-1…1): widest at the middle. */
function arcShape(t: number, bulge = 0.4): number {
   return 1 - bulge + bulge * Math.cos((Math.max(-1, Math.min(1, t)) * Math.PI) / 2);
}

function firstHopRadius(node: NeighborNode): number {
   return 4.5 + Math.min(4, Math.sqrt(node.edges.length) * 1.4);
}

function secondHopRadius(node: NeighborNode): number {
   return 3 + Math.min(2.5, node.score * 0.6);
}

/** Vertical gap between rows: generous for a handful of verses, tight for many. */
function rowSpacing(count: number, minimum: number): number {
   return Math.max(minimum, Math.min(44, 300 / Math.max(1, count)));
}

/**
 * Keeps each value as close to its anchor as possible while enforcing a minimum gap
 * (average of a push-down pass and a push-up pass, so the group is not biased either way).
 */
export function spreadWithGap(anchors: readonly number[], gap: number): number[] {
   const down: number[] = [];
   const up: number[] = new Array<number>(anchors.length);

   anchors.forEach((anchor, index) => {
      down.push(index === 0 ? anchor : Math.max(anchor, down[index - 1] + gap));
   });

   for (let index = anchors.length - 1; index >= 0; index -= 1) {
      up[index] = index === anchors.length - 1 ? anchors[index] : Math.min(anchors[index], up[index + 1] - gap);
   }

   return anchors.map((_, index) => (down[index] + up[index]) / 2);
}

function placeArcs(
   nodes: readonly NeighborNode[],
   side: -1 | 1,
   centerKey: string,
   label: (node: NeighborNode) => string,
): { placed: LayoutNode[]; outerRadius: number } {
   const arcs = Math.max(1, Math.ceil(nodes.length / MAX_PER_ARC));
   const step = rowSpacing(nodes.length, ROW) / arcs;
   const height = (nodes.length - 1) * step;
   const half = Math.max(height / 2, 180);
   const placed = nodes.map((node, index): LayoutNode => {
      const y = -height / 2 + index * step;
      const radius = FIRST_RADIUS + (index % arcs) * ARC_GAP;

      return {
         key: node.key,
         x: side * radius * arcShape(y / half),
         y,
         r: firstHopRadius(node),
         depth: 1,
         direction: node.direction,
         side,
         label: label(node),
         parentKey: centerKey,
      };
   });

   return { placed, outerRadius: nodes.length > 0 ? FIRST_RADIUS + (arcs - 1) * ARC_GAP : 0 };
}

function labelWidth(node: LayoutNode): number {
   return node.label.length * (node.depth === 2 ? 5.6 : 6.4) + 10;
}

function measure(nodes: readonly LayoutNode[]): Bounds {
   const bounds: Bounds = { minX: -60, maxX: 60, minY: -40, maxY: 60 };

   for (const node of nodes) {
      const width = labelWidth(node);
      const left = node.side === -1 ? node.x - node.r - width : node.side === 0 ? node.x - width / 2 : node.x - node.r;
      const right = node.side === 1 ? node.x + node.r + width : node.side === 0 ? node.x + width / 2 : node.x + node.r;

      bounds.minX = Math.min(bounds.minX, left);
      bounds.maxX = Math.max(bounds.maxX, right);
      bounds.minY = Math.min(bounds.minY, node.y - node.r - 6);
      bounds.maxY = Math.max(bounds.maxY, node.y + node.r + (node.side === 0 ? 24 : 6));
   }

   return bounds;
}

export interface LayoutOptions {
   /** Label drawn next to a node (short form, e.g. "1 Cor. 13:4-7"). */
   label: (node: NeighborNode) => string;
   centerLabel: string;
}

export function computeLayout(graph: EgoGraph, { label, centerLabel }: LayoutOptions): GraphLayout {
   const center: LayoutNode = {
      key: graph.centerKey,
      x: 0,
      y: 0,
      r: CENTER_RADIUS,
      depth: 0,
      direction: 'center',
      side: 0,
      label: centerLabel,
      parentKey: null,
   };
   const firstHop = graph.nodes.filter((node) => node.depth === 1);
   const secondHop = graph.nodes.filter((node) => node.depth === 2);
   const right = placeArcs(firstHop.filter((node) => node.direction === 'outgoing'), 1, graph.centerKey, label);
   const left = placeArcs(firstHop.filter((node) => node.direction === 'incoming'), -1, graph.centerKey, label);
   const both = firstHop
      .filter((node) => node.direction === 'both')
      .map((node, index): LayoutNode => {
         const row = Math.floor(index / 2);
         const above = index % 2 === 0;

         return {
            key: node.key,
            x: 0,
            y: above ? -(BOTH_START + row * BOTH_STEP) : BOTH_START + 18 + row * BOTH_STEP,
            r: firstHopRadius(node),
            depth: 1,
            direction: 'both',
            side: 1,
            label: label(node),
            parentKey: graph.centerKey,
         };
      });
   const nodes: LayoutNode[] = [ center, ...left.placed, ...both, ...right.placed ];
   const index = new Map(nodes.map((node) => [ node.key, node ]));

   // Second hop: each verse sits beside the first-hop verses it is reached through.
   const outer: Record<'-1' | '1', Array<{ node: NeighborNode; anchor: number; parentKey: string }>> = { '-1': [], '1': [] };

   for (const node of secondHop) {
      const parents = node.via.map((via) => index.get(via.from)).filter((parent): parent is LayoutNode => parent !== undefined);

      if (parents.length === 0) {
         continue;
      }

      const sumX = parents.reduce((sum, parent) => sum + parent.x, 0);
      const anchor = parents.reduce((sum, parent) => sum + parent.y, 0) / parents.length;

      outer[sumX < 0 ? '-1' : '1'].push({ node, anchor, parentKey: parents[0].key });
   }

   for (const side of [ -1, 1 ] as const) {
      const group = outer[String(side) as '-1' | '1'].sort(
         (a, b) => a.anchor - b.anchor || a.node.verseId - b.node.verseId,
      );

      if (group.length === 0) {
         continue;
      }

      const arcs = Math.max(1, Math.ceil(group.length / MAX_PER_SECOND_ARC));
      const ys = spreadWithGap(group.map((item) => item.anchor), ROW_SECOND / arcs);
      const half = Math.max(180, ...ys.map((y) => Math.abs(y)));
      const base = Math.max(side === 1 ? right.outerRadius : left.outerRadius, FIRST_RADIUS - ARC_GAP) + SECOND_GAP;

      group.forEach((item, position) => {
         const y = ys[position];
         const placed: LayoutNode = {
            key: item.node.key,
            // A flatter arc than the first hop, so its ends stay clear of the first-hop labels.
            x: side * (base + (position % arcs) * ARC_GAP) * arcShape(y / half, 0.16),
            y,
            r: secondHopRadius(item.node),
            depth: 2,
            direction: item.node.direction,
            side,
            label: label(item.node),
            parentKey: item.parentKey,
         };

         nodes.push(placed);
         index.set(placed.key, placed);
      });
   }

   const links = graph.links.filter((link) => index.has(link.a) && index.has(link.b));
   const neighbors = new Map<string, Set<string>>();

   for (const link of links) {
      for (const [ from, to ] of [ [ link.a, link.b ], [ link.b, link.a ] ]) {
         const set = neighbors.get(from);

         if (set) {
            set.add(to);
         } else {
            neighbors.set(from, new Set([ to ]));
         }
      }
   }

   return { centerKey: graph.centerKey, nodes, links, index, neighbors, bounds: measure(nodes) };
}

export interface Point {
   x: number;
   y: number;
}

/**
 * Path from the inner node `a` to the outer node `b`, trimmed to the node edges so arrowheads
 * touch the circles. Sideways links leave horizontally and arrive horizontally (a soft S).
 */
export function linkPath(a: Point, aRadius: number, b: Point, bRadius: number): string {
   const dx = b.x - a.x;
   const dy = b.y - a.y;
   const round = (value: number): string => value.toFixed(1);

   if (Math.abs(dx) < 60) {
      const length = Math.hypot(dx, dy) || 1;
      const ux = dx / length;
      const uy = dy / length;

      return `M${round(a.x + ux * (aRadius + 2))},${round(a.y + uy * (aRadius + 2))}L${round(b.x - ux * (bRadius + 3))},${round(b.y - uy * (bRadius + 3))}`;
   }

   const sign = Math.sign(dx);
   const x1 = a.x + sign * (aRadius + 2);
   const x2 = b.x - sign * (bRadius + 3);
   const mid = (x1 + x2) / 2;

   return `M${round(x1)},${round(a.y)}C${round(mid)},${round(a.y)} ${round(mid)},${round(b.y)} ${round(x2)},${round(b.y)}`;
}

export interface ViewTransform {
   x: number;
   y: number;
   k: number;
}

/** Transform that fits `bounds` inside a `width` × `height` box with padding, never zooming past `maxScale`. */
export function fitTransform(bounds: Bounds, width: number, height: number, padding = 20, maxScale = 1.15): ViewTransform {
   const boxWidth = Math.max(1, bounds.maxX - bounds.minX);
   const boxHeight = Math.max(1, bounds.maxY - bounds.minY);
   const k = Math.max(
      0.2,
      Math.min(maxScale, (Math.max(1, width) - padding * 2) / boxWidth, (Math.max(1, height) - padding * 2) / boxHeight),
   );

   return {
      k,
      x: width / 2 - ((bounds.minX + bounds.maxX) / 2) * k,
      y: height / 2 - ((bounds.minY + bounds.maxY) / 2) * k,
   };
}

/** Nearest node in an arrow-key direction (within a 120° cone), for keyboard travel. */
export function nearestInDirection(
   nodes: readonly LayoutNode[],
   fromKey: string,
   direction: 'left' | 'right' | 'up' | 'down',
): LayoutNode | null {
   const from = nodes.find((node) => node.key === fromKey);

   if (!from) {
      return null;
   }

   const vector = { left: [ -1, 0 ], right: [ 1, 0 ], up: [ 0, -1 ], down: [ 0, 1 ] }[direction];
   let best: LayoutNode | null = null;
   let bestCost = Infinity;

   for (const node of nodes) {
      if (node.key === fromKey) {
         continue;
      }

      const dx = node.x - from.x;
      const dy = node.y - from.y;
      const distance = Math.hypot(dx, dy);
      const along = (dx * vector[0] + dy * vector[1]) / (distance || 1);

      if (along < 0.5) {
         continue;
      }

      // Prefer nodes straight ahead: off-axis candidates pay a penalty.
      const cost = distance * (2 - along);

      if (cost < bestCost) {
         best = node;
         bestCost = cost;
      }
   }

   return best;
}
