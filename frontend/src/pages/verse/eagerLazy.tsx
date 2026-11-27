import { lazy, useState, type ComponentType } from 'react';

/**
 * A component in its own chunk whose download starts right away (in parallel with the page's data),
 * not when it first renders. Once the chunk has arrived the component renders synchronously:
 * `React.lazy` alone would suspend on first use even then, and React holds a revealed fallback
 * for ~300 ms — which would delay the first graph for nothing.
 */
export function eagerLazy<Props extends object>(load: () => Promise<{ default: ComponentType<Props> }>): ComponentType<Props> {
   let Loaded: ComponentType<Props> | null = null;
   const first = load();

   first.then(
      (module) => {
         Loaded = module.default;
      },
      () => undefined,
   );

   // A failed first download is retried when the component is actually needed.
   const Lazy = lazy(() => first.catch(load));

   return function EagerLazy(props: Props): React.ReactElement {
      // Chosen once per mount: swapping the component type later would remount it and drop its state.
      const [ Component ] = useState<ComponentType<Props>>(() => Loaded ?? Lazy);

      return <Component {...props} />;
   };
}
