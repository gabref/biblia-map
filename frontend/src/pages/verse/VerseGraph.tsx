import { Maximize2, ZoomIn, ZoomOut } from 'lucide-react';
import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { IconButton, VerseCard } from '../../components/ui';
import { useT } from '../../i18n';
import { cx } from '../../lib/cx';
import { DURATION, motionDuration } from '../../lib/motion';
import {
   fitTransform,
   linkPath,
   nearestInDirection,
   type GraphLayout,
   type LayoutNode,
   type Point,
   type ViewTransform,
} from './layout';

export interface GraphPreview {
   reference: string;
   text: string | null | undefined;
   meta?: string;
}

export interface VerseGraphProps {
   layout: GraphLayout;
   /** Accessible name of the whole graph. */
   label: string;
   /** Text alternative: what the picture shows and how to use it. */
   description: string;
   selectedKey: string | null;
   /** Key highlighted from outside (a hovered list row). */
   hoveredKey: string | null;
   /** The previously studied verse, pulsed for a moment after moving on. */
   flashKey: string | null;
   /** Node the student opened; the new centre glides in from its position. */
   originKey: string | null;
   /** Dim the picture while newer data loads (never blank it). */
   busy: boolean;
   onHover: (key: string | null) => void;
   onSelect: (key: string | null) => void;
   onStudy: (key: string) => void;
   /** Accessible name of a node, e.g. "Romans 5:8, cited by John 3:16". */
   describeNode: (key: string) => string;
   /** Hover/focus preview card for a node. */
   preview: (key: string) => GraphPreview | null;
}

interface Scene {
   layout: GraphLayout;
   /** Nodes of the previous layout that are gone: kept for one fade-out. */
   exiting: LayoutNode[];
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;

/** `cubic-bezier(0.2, 0, 0, 1)` — the `--ease-standard` token, for the rAF tween. */
function easeStandard(progress: number): number {
   const x1 = 0.2;
   const x2 = 0;
   const y1 = 0;
   const y2 = 1;
   const curve = (a: number, b: number, t: number): number => 3 * a * t * (1 - t) ** 2 + 3 * b * t ** 2 * (1 - t) + t ** 3;
   let low = 0;
   let high = 1;

   for (let step = 0; step < 14; step += 1) {
      const middle = (low + high) / 2;

      if (curve(x1, x2, middle) < progress) {
         low = middle;
      } else {
         high = middle;
      }
   }

   return curve(y1, y2, (low + high) / 2);
}

function keyOf(target: EventTarget | null): string | null {
   return target instanceof Element ? (target.closest('[data-key]')?.getAttribute('data-key') ?? null) : null;
}

/**
 * The ego graph as an SVG. React renders the marks once per layout; positions, pan/zoom,
 * the move between two layouts and the hover highlight are all applied straight to the DOM
 * (refs + requestAnimationFrame), so nothing re-renders per animation frame.
 */
export const VerseGraph = memo(function VerseGraph({
   layout,
   label,
   description,
   selectedKey,
   hoveredKey,
   flashKey,
   originKey,
   busy,
   onHover,
   onSelect,
   onStudy,
   describeNode,
   preview,
}: VerseGraphProps): React.ReactElement {
   const t = useT();
   const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
   const shellRef = useRef<HTMLDivElement | null>(null);
   const svgRef = useRef<SVGSVGElement | null>(null);
   const viewportRef = useRef<SVGGElement | null>(null);
   const tipRef = useRef<HTMLDivElement | null>(null);
   const positions = useRef(new Map<string, Point>());
   const view = useRef<ViewTransform>({ x: 0, y: 0, k: 1 });
   const size = useRef({ width: 0, height: 0 });
   /** rAF of a view-only animation (fit). */
   const frame = useRef(0);
   /** rAF of the layout tween (positions + view). */
   const tweenFrame = useRef(0);
   /** View the running layout tween is heading for; a resize mid-tween only retargets it. */
   const tweenView = useRef<ViewTransform | null>(null);
   const userMoved = useRef(false);
   const layoutRef = useRef(layout);
   const originRef = useRef(originKey);
   const [ scene, setScene ] = useState<Scene>({ layout, exiting: [] });
   const [ tipKey, setTipKey ] = useState<string | null>(null);
   let current = scene;

   if (scene.layout !== layout) {
      current = { layout, exiting: scene.layout.nodes.filter((node) => !layout.index.has(node.key)) };
      setScene(current);
   }

   useEffect(() => {
      originRef.current = originKey;
   }, [ originKey ]);

   const applyView = useCallback((): void => {
      const { x, y, k } = view.current;

      viewportRef.current?.setAttribute('transform', `translate(${x.toFixed(2)},${y.toFixed(2)}) scale(${k.toFixed(4)})`);
      // Zoomed far out, labels are too small to read: drop them rather than draw noise.
      svgRef.current?.classList.toggle('is-small', k < 0.5);
      svgRef.current?.classList.toggle('is-tiny', k < 0.36);
   }, []);

   const draw = useCallback((): void => {
      const svg = svgRef.current;
      const active = layoutRef.current;

      if (!svg) {
         return;
      }

      svg.querySelectorAll<SVGGElement>('[data-key]').forEach((element) => {
         const point = positions.current.get(element.dataset.key as string);

         if (point) {
            element.setAttribute('transform', `translate(${point.x.toFixed(1)},${point.y.toFixed(1)})`);
         }
      });

      svg.querySelectorAll<SVGPathElement>('[data-link]').forEach((element) => {
         const a = active.index.get(element.dataset.a as string);
         const b = active.index.get(element.dataset.b as string);
         const from = a && positions.current.get(a.key);
         const to = b && positions.current.get(b.key);

         if (a && b && from && to) {
            element.setAttribute('d', linkPath(from, a.r, to, b.r));
         }
      });
   }, []);

   const fit = useCallback(
      (animate: boolean): void => {
         const target = fitTransform(layoutRef.current.bounds, size.current.width, size.current.height);
         const duration = animate ? motionDuration(DURATION.slow) : 0;

         userMoved.current = false;
         window.cancelAnimationFrame(frame.current);

         if (tweenView.current) {
            tweenView.current = target;

            return;
         }

         if (duration === 0) {
            view.current = target;
            applyView();

            return;
         }

         const from = { ...view.current };
         const startedAt = performance.now();
         const tick = (now: number): void => {
            const eased = easeStandard(Math.min(1, (now - startedAt) / duration));

            view.current = {
               x: from.x + (target.x - from.x) * eased,
               y: from.y + (target.y - from.y) * eased,
               k: from.k + (target.k - from.k) * eased,
            };
            applyView();

            if (eased < 1) {
               frame.current = window.requestAnimationFrame(tick);
            }
         };

         frame.current = window.requestAnimationFrame(tick);
      },
      [ applyView ],
   );

   const zoomAt = useCallback(
      (factor: number, point?: Point): void => {
         const { x, y, k } = view.current;
         const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, k * factor));
         const anchor = point ?? { x: size.current.width / 2, y: size.current.height / 2 };
         const ratio = next / k;

         window.cancelAnimationFrame(frame.current);
         userMoved.current = true;
         view.current = { k: next, x: anchor.x - (anchor.x - x) * ratio, y: anchor.y - (anchor.y - y) * ratio };
         applyView();
      },
      [ applyView ],
   );

   // Move from the previous layout to the new one: survivors glide, newcomers grow out of their parent.
   useLayoutEffect(() => {
      const next = current.layout;
      const previous = positions.current;
      const isFirstPaint = previous.size === 0;
      const from = new Map<string, Point>();
      const to = new Map<string, Point>();
      const centerStart = previous.get(next.centerKey) ?? (originRef.current ? previous.get(originRef.current) : undefined) ?? { x: 0, y: 0 };

      layoutRef.current = next;

      for (const node of next.nodes) {
         const start =
            previous.get(node.key) ??
            (node.depth === 0
               ? centerStart
               : ((node.parentKey ? (from.get(node.parentKey) ?? previous.get(node.parentKey)) : undefined) ?? centerStart));

         from.set(node.key, start);
         to.set(node.key, { x: node.x, y: node.y });
      }

      const leaving = new Map<string, Point>();

      for (const node of current.exiting) {
         const point = previous.get(node.key);

         if (point) {
            leaving.set(node.key, point);
         }
      }

      const fromView = isFirstPaint ? fitTransform(next.bounds, size.current.width, size.current.height) : { ...view.current };
      const duration = motionDuration(DURATION.slower);
      const finish = (): void => {
         positions.current = new Map([ ...to, ...leaving ]);

         if (!userMoved.current && tweenView.current) {
            view.current = tweenView.current;
         }

         tweenView.current = null;
         draw();
         applyView();
      };

      userMoved.current = false;
      window.cancelAnimationFrame(frame.current);
      window.cancelAnimationFrame(tweenFrame.current);
      tweenView.current = fitTransform(next.bounds, size.current.width, size.current.height);

      if (duration === 0) {
         finish();

         return undefined;
      }

      const startedAt = performance.now();
      const tick = (now: number): void => {
         const progress = Math.min(1, (now - startedAt) / duration);
         const eased = easeStandard(progress);
         const moving = new Map<string, Point>(leaving);
         const targetView = tweenView.current;

         for (const [ key, target ] of to) {
            const start = from.get(key) as Point;

            moving.set(key, { x: start.x + (target.x - start.x) * eased, y: start.y + (target.y - start.y) * eased });
         }

         positions.current = moving;

         // Once the student pans or zooms mid-move, the view is theirs; only the nodes keep travelling.
         if (!userMoved.current && targetView) {
            view.current = {
               x: fromView.x + (targetView.x - fromView.x) * eased,
               y: fromView.y + (targetView.y - fromView.y) * eased,
               k: fromView.k + (targetView.k - fromView.k) * eased,
            };
            applyView();
         }

         draw();

         if (progress < 1) {
            tweenFrame.current = window.requestAnimationFrame(tick);
         } else {
            finish();
         }
      };

      // Paint the starting state now so nothing flashes at its final position first.
      positions.current = new Map([ ...from, ...leaving ]);
      view.current = fromView;
      draw();
      applyView();
      tweenFrame.current = window.requestAnimationFrame(tick);

      return () => window.cancelAnimationFrame(tweenFrame.current);
   }, [ applyView, current, draw ]);

   // Keep the picture fitted to its box until the student pans or zooms.
   useLayoutEffect(() => {
      const shell = shellRef.current;

      if (!shell) {
         return undefined;
      }

      const measure = (): void => {
         const rect = shell.getBoundingClientRect();
         const changed = rect.width !== size.current.width || rect.height !== size.current.height;

         size.current = { width: rect.width, height: rect.height };

         if (!changed || userMoved.current) {
            return;
         }

         if (tweenView.current) {
            tweenView.current = fitTransform(layoutRef.current.bounds, rect.width, rect.height);
         } else {
            fit(false);
         }
      };

      measure();

      if (typeof ResizeObserver === 'undefined') {
         return undefined;
      }

      const observer = new ResizeObserver(measure);

      observer.observe(shell);

      return () => observer.disconnect();
   }, [ fit ]);

   // Wheel zoom needs a non-passive listener (React's onWheel is passive, so the page would scroll too).
   // It sits on the whole graph container, so the zoom buttons and the hover card block page scroll as well.
   useEffect(() => {
      const shell = shellRef.current;

      if (!shell) {
         return undefined;
      }

      const handleWheel = (event: WheelEvent): void => {
         event.preventDefault();

         const rect = (svgRef.current ?? shell).getBoundingClientRect();
         const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaMode === 2 ? event.deltaY * rect.height : event.deltaY;

         if (delta === 0) {
            return;
         }

         setTipKey(null);
         zoomAt(Math.exp(-delta * (event.ctrlKey ? 0.01 : 0.0018)), { x: event.clientX - rect.left, y: event.clientY - rect.top });
      };

      shell.addEventListener('wheel', handleWheel, { passive: false });

      return () => shell.removeEventListener('wheel', handleWheel);
   }, [ zoomAt ]);

   // Focus + context: the active node, its direct relations and the centre stay lit; the rest dims.
   const selectedInLayout = selectedKey !== null && current.layout.index.has(selectedKey) ? selectedKey : null;
   const activeKey = [ tipKey, hoveredKey, selectedInLayout ].find((key) => key !== null && current.layout.index.has(key)) ?? null;

   useLayoutEffect(() => {
      const svg = svgRef.current;

      if (!svg) {
         return;
      }

      const related = activeKey && activeKey !== current.layout.centerKey ? current.layout.neighbors.get(activeKey) : undefined;
      const tabStop = selectedInLayout ?? current.layout.centerKey;

      svg.querySelectorAll<SVGGElement>('[data-key]').forEach((element) => {
         const key = element.dataset.key as string;
         const lit = !related || key === activeKey || related.has(key);

         element.classList.toggle('is-selected', key === selectedInLayout);
         element.classList.toggle('is-active', key === activeKey);
         element.classList.toggle('is-dimmed', !lit);
         element.classList.toggle('is-flash', key === flashKey);
         element.setAttribute('tabindex', key === tabStop ? '0' : '-1');
      });

      svg.querySelectorAll<SVGPathElement>('[data-link]').forEach((element) => {
         const touches = element.dataset.a === activeKey || element.dataset.b === activeKey;

         element.classList.toggle('is-active', Boolean(related) && touches);
         element.classList.toggle('is-dimmed', Boolean(related) && !touches);
      });
   }, [ activeKey, current, flashKey, selectedInLayout ]);

   // Preview card anchored to the hovered / focused node.
   const tip = tipKey && current.layout.index.has(tipKey) ? preview(tipKey) : null;

   useLayoutEffect(() => {
      const element = tipRef.current;
      const node = tipKey ? current.layout.index.get(tipKey) : undefined;
      const point = tipKey ? positions.current.get(tipKey) : undefined;

      if (!element || !node || !point) {
         return;
      }

      const { x, y, k } = view.current;
      const screenX = point.x * k + x;
      const screenY = point.y * k + y;
      const width = element.offsetWidth;
      const height = element.offsetHeight;
      const gap = node.r * k + 10;
      const above = screenY - gap - height >= 4;

      element.style.left = `${Math.max(4, Math.min(size.current.width - width - 4, screenX - width / 2))}px`;
      element.style.top = `${above ? screenY - gap - height : Math.min(size.current.height - height - 4, screenY + gap)}px`;
   }, [ current, tip, tipKey ]);

   // ---------------------------------------------------------------- pointer: pan, pinch, click
   const pointers = useRef(new Map<number, Point>());
   const gesture = useRef<{ moved: boolean; pinch: number | null }>({ moved: false, pinch: null });

   const localPoint = (event: React.PointerEvent): Point => {
      const rect = (svgRef.current as SVGSVGElement).getBoundingClientRect();

      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
   };

   const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>): void => {
      if (event.pointerType === 'mouse' && event.button !== 0) {
         return;
      }

      pointers.current.set(event.pointerId, localPoint(event));

      if (pointers.current.size === 1) {
         gesture.current = { moved: false, pinch: null };
      } else if (pointers.current.size === 2) {
         const [ first, second ] = Array.from(pointers.current.values());

         gesture.current = { moved: true, pinch: Math.hypot(second.x - first.x, second.y - first.y) };
      }
   };

   const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>): void => {
      const previous = pointers.current.get(event.pointerId);

      if (!previous) {
         return;
      }

      const point = localPoint(event);

      pointers.current.set(event.pointerId, point);

      if (pointers.current.size === 2 && gesture.current.pinch) {
         const [ first, second ] = Array.from(pointers.current.values());
         const distance = Math.hypot(second.x - first.x, second.y - first.y);

         zoomAt(distance / gesture.current.pinch, { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 });
         gesture.current.pinch = distance;

         return;
      }

      if (pointers.current.size !== 1) {
         return;
      }

      if (!gesture.current.moved) {
         // A few pixels of slack so a click with a shaky hand is still a click.
         if (Math.hypot(point.x - previous.x, point.y - previous.y) < 3) {
            pointers.current.set(event.pointerId, previous);

            return;
         }

         gesture.current.moved = true;
         event.currentTarget.setPointerCapture(event.pointerId);
         event.currentTarget.classList.add('is-panning');
         setTipKey(null);
      }

      window.cancelAnimationFrame(frame.current);
      userMoved.current = true;
      view.current = { ...view.current, x: view.current.x + point.x - previous.x, y: view.current.y + point.y - previous.y };
      applyView();
   };

   const handlePointerEnd = (event: React.PointerEvent<SVGSVGElement>): void => {
      pointers.current.delete(event.pointerId);
      event.currentTarget.classList.remove('is-panning');

      if (pointers.current.size < 2) {
         gesture.current.pinch = null;
      }
   };

   const handleClick = (event: React.MouseEvent<SVGSVGElement>): void => {
      if (gesture.current.moved) {
         gesture.current.moved = false;

         return;
      }

      const key = keyOf(event.target);

      onSelect(key && key !== current.layout.centerKey ? key : null);
   };

   const handleDoubleClick = (event: React.MouseEvent<SVGSVGElement>): void => {
      const key = keyOf(event.target);

      if (key && key !== current.layout.centerKey) {
         onStudy(key);
      }
   };

   const handlePointerOver = (event: React.PointerEvent<SVGSVGElement>): void => {
      if (event.pointerType === 'touch' || pointers.current.size > 0) {
         return;
      }

      const key = keyOf(event.target);

      setTipKey(key);
      onHover(key);
   };

   const handlePointerLeave = (): void => {
      setTipKey(null);
      onHover(null);
   };

   const handleFocus = (event: React.FocusEvent<SVGSVGElement>): void => {
      const key = keyOf(event.target);

      if (key && event.target.matches(':focus-visible')) {
         setTipKey(key);
         onHover(key);
      }
   };

   const handleBlur = (): void => {
      setTipKey(null);
      onHover(null);
   };

   const handleKeyDown = (event: React.KeyboardEvent<SVGSVGElement>): void => {
      const key = keyOf(event.target);
      const arrows: Record<string, 'left' | 'right' | 'up' | 'down'> = {
         ArrowLeft: 'left',
         ArrowRight: 'right',
         ArrowUp: 'up',
         ArrowDown: 'down',
      };

      if (event.metaKey || event.ctrlKey || event.altKey) {
         return;
      }

      if (arrows[event.key] && key) {
         const next = nearestInDirection(current.layout.nodes, key, arrows[event.key]);

         event.preventDefault();

         if (next) {
            svgRef.current?.querySelector<SVGGElement>(`[data-key="${next.key}"]`)?.focus();
         }
      } else if (event.key === 'Enter' && key && key !== current.layout.centerKey) {
         event.preventDefault();
         onStudy(key);
      } else if (event.key === ' ' && key) {
         event.preventDefault();
         onSelect(key !== current.layout.centerKey ? key : null);
      } else if (event.key === 'Escape') {
         onSelect(null);
         setTipKey(null);
      } else if (event.key === '+' || event.key === '=') {
         zoomAt(1.25);
      } else if (event.key === '-') {
         zoomAt(0.8);
      } else if (event.key === '0') {
         fit(true);
      }
   };

   const linkElements = useMemo(
      () =>
         current.layout.links.map((link) => (
            <path
               key={link.key}
               data-link={link.key}
               data-a={link.a}
               data-b={link.b}
               className={cx(
                  'vs-link',
                  `vs-link--${link.direction}`,
                  link.depth === 2 && 'vs-link--far',
                  link.studyNoteOnly && 'vs-link--note',
               )}
               strokeWidth={link.depth === 2 ? 1 : 1.1 + Math.min(1.8, (link.count - 1) * 0.6)}
               markerEnd={link.depth === 1 && link.direction !== 'incoming' ? `url(#${uid}-${link.direction})` : undefined}
               markerStart={link.depth === 1 && link.direction !== 'outgoing' ? `url(#${uid}-${link.direction})` : undefined}
            />
         )),
      [ current, uid ],
   );
   const nodeElements = useMemo(() => {
      const exiting = new Set(current.exiting);

      return [ ...current.layout.nodes, ...current.exiting ].map((node) => {
         const gone = exiting.has(node);

         return (
            <g
               key={node.key}
               data-key={gone ? undefined : node.key}
               className={cx(
                  'vs-node',
                  `vs-node--${node.direction}`,
                  node.depth === 2 && 'vs-node--far',
                  gone && 'is-exiting',
               )}
               role={gone ? undefined : 'button'}
               aria-hidden={gone || undefined}
               aria-label={gone ? undefined : describeNode(node.key)}
            >
               <circle className="vs-node__ring" r={node.r + 5} />
               <circle className="vs-node__dot" r={node.r} />
               <text
                  className="vs-node__label"
                  x={node.side === 0 ? 0 : node.side * (node.r + 5)}
                  y={node.side === 0 ? node.r + 15 : 0}
                  dy={node.side === 0 ? undefined : '0.34em'}
                  textAnchor={node.side === 0 ? 'middle' : node.side === 1 ? 'start' : 'end'}
               >
                  {node.label}
               </text>
            </g>
         );
      });
   }, [ current, describeNode ]);

   // Exiting nodes keep their last transform because their element (same key) is reused.
   useLayoutEffect(() => {
      svgRef.current?.querySelectorAll<SVGGElement>('.vs-node.is-exiting').forEach((element) => {
         element.removeAttribute('tabindex');
      });
   }, [ current ]);

   return (
      <div ref={shellRef} className={cx('vs-graph', busy && 'is-busy')}>
         <p id={`${uid}-desc`} className="visually-hidden">
            {description}
         </p>
         <svg
            ref={svgRef}
            className="vs-graph__svg"
            role="group"
            aria-label={label}
            aria-describedby={`${uid}-desc`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
            onPointerOver={handlePointerOver}
            onPointerLeave={handlePointerLeave}
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
         >
            <defs>
               {([ 'outgoing', 'incoming', 'both' ] as const).map((direction) => (
                  <marker
                     key={direction}
                     id={`${uid}-${direction}`}
                     viewBox="0 0 8 8"
                     refX="7"
                     refY="4"
                     markerWidth="7"
                     markerHeight="7"
                     markerUnits="userSpaceOnUse"
                     orient="auto-start-reverse"
                  >
                     <path d="M0,0.8 L8,4 L0,7.2 Z" className={`vs-arrow vs-arrow--${direction}`} />
                  </marker>
               ))}
            </defs>
            <g ref={viewportRef} data-testid="graph-viewport">
               <g className="vs-graph__links" aria-hidden="true">
                  {linkElements}
               </g>
               <g className="vs-graph__nodes">{nodeElements}</g>
            </g>
         </svg>

         {tip ? (
            <div ref={tipRef} className="vs-graph__tip" role="presentation">
               <VerseCard reference={tip.reference} text={tip.text} density="compact" meta={tip.meta} />
            </div>
         ) : null}

         <div className="vs-graph__controls">
            <IconButton label={t('verse.graph.zoomIn')} size="sm" variant="secondary" onClick={() => zoomAt(1.3)}>
               <ZoomIn size={15} />
            </IconButton>
            <IconButton label={t('verse.graph.zoomOut')} size="sm" variant="secondary" onClick={() => zoomAt(1 / 1.3)}>
               <ZoomOut size={15} />
            </IconButton>
            <IconButton label={t('verse.graph.fit')} size="sm" variant="secondary" onClick={() => fit(true)}>
               <Maximize2 size={15} />
            </IconButton>
         </div>
      </div>
   );
});
