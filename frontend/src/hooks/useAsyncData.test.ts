import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useAsyncData } from './useAsyncData';

interface Deferred<T> {
   promise: Promise<T>;
   resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
   let resolve!: (value: T) => void;
   const promise = new Promise<T>((done) => {
      resolve = done;
   });

   return { promise, resolve };
}

describe('useAsyncData', () => {
   it('never returns the previous dependencies data on the render where they change', async () => {
      const loads = new Map([ [ 'nwt', deferred<string>() ], [ 'rbi8', deferred<string>() ] ]);
      const seen: Array<[ string, string | null ]> = [];
      const { result, rerender } = renderHook(
         ({ id }) => {
            const state = useAsyncData(() => loads.get(id)!.promise, [ id ]);
            seen.push([ id, state.data ]);
            return state;
         },
         { initialProps: { id: 'nwt' } },
      );

      await act(async () => loads.get('nwt')!.resolve('nwt-data'));
      expect(result.current.data).toBe('nwt-data');

      seen.length = 0;
      rerender({ id: 'rbi8' });

      expect(seen.every(([ id, data ]) => id !== 'rbi8' || data !== 'nwt-data')).toBe(true);
      expect(result.current.data).toBeNull();
      expect(result.current.isLoading).toBe(true);

      await act(async () => loads.get('rbi8')!.resolve('rbi8-data'));
      expect(result.current.data).toBe('rbi8-data');
   });

   it('ignores a slow response that arrives after the dependencies changed', async () => {
      const slow = deferred<string>();
      const fast = deferred<string>();
      const { result, rerender } = renderHook(
         ({ id }) => useAsyncData(() => (id === 'a' ? slow.promise : fast.promise), [ id ]),
         { initialProps: { id: 'a' } },
      );

      rerender({ id: 'b' });
      await act(async () => fast.resolve('b-data'));
      await act(async () => slow.resolve('a-data'));

      expect(result.current.data).toBe('b-data');
   });

   it('keeps previous data while reloading when asked to', async () => {
      const loads = new Map([ [ 'combined', deferred<string>() ], [ 'crossrefs', deferred<string>() ] ]);
      const { result, rerender } = renderHook(
         ({ kind }) => useAsyncData(() => loads.get(kind)!.promise, [ kind ], { keepPreviousData: true }),
         { initialProps: { kind: 'combined' } },
      );

      await act(async () => loads.get('combined')!.resolve('combined-matrix'));
      rerender({ kind: 'crossrefs' });

      expect(result.current.data).toBe('combined-matrix');
      expect(result.current.isStale).toBe(true);
      expect(result.current.isLoading).toBe(true);

      await act(async () => loads.get('crossrefs')!.resolve('crossrefs-matrix'));
      expect(result.current.data).toBe('crossrefs-matrix');
      expect(result.current.isStale).toBe(false);
   });

   it('reports a loader that throws synchronously as an error', async () => {
      const { result } = renderHook(() =>
         useAsyncData<string>(() => {
            throw new Error('boom');
         }, []),
      );

      await waitFor(() => expect(result.current.error?.message).toBe('boom'));
      expect(result.current.isLoading).toBe(false);
   });
});
