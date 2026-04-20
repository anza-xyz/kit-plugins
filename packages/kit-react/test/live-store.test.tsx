import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { LiveStore } from '../src/internal/live-store';
import { nullLiveStore, useLiveQueryResult, useLiveStore } from '../src/internal/live-store';

type StubStore<T> = LiveStore<T> & { emit: (value: T | undefined, err?: unknown, slot?: bigint) => void };

function createStubStore<T>(): StubStore<T> {
    const listeners = new Set<() => void>();
    let state: { context: { slot: bigint }; value: T } | undefined;
    let error: unknown;
    return {
        emit(value, err, slot = 0n) {
            state = value === undefined ? undefined : { context: { slot }, value };
            error = err;
            listeners.forEach(l => l());
        },
        getError: () => error,
        getState: () => state as never,
        subscribe(l) {
            listeners.add(l);
            return () => listeners.delete(l);
        },
    } as StubStore<T>;
}

describe.skipIf(!__BROWSER__ && !__REACTNATIVE__)('useLiveStore', () => {
    it('aborts the previous signal when deps change', () => {
        const signals: AbortSignal[] = [];
        const factory = (signal: AbortSignal) => {
            signals.push(signal);
            return nullLiveStore<number>();
        };

        const { rerender } = renderHook(({ key }: { key: number }) => useLiveStore(factory, [key]), {
            initialProps: { key: 1 },
        });
        expect(signals).toHaveLength(1);
        expect(signals[0]?.aborted).toBe(false);

        rerender({ key: 2 });
        expect(signals).toHaveLength(2);
        expect(signals[0]?.aborted).toBe(true);
        expect(signals[1]?.aborted).toBe(false);
    });

    it('aborts the signal on unmount', () => {
        const signals: AbortSignal[] = [];
        const { unmount } = renderHook(() =>
            useLiveStore(signal => {
                signals.push(signal);
                return nullLiveStore<number>();
            }, []),
        );
        expect(signals[0]?.aborted).toBe(false);
        unmount();
        expect(signals[0]?.aborted).toBe(true);
    });
});

describe.skipIf(!__BROWSER__ && !__REACTNATIVE__)('useLiveQueryResult', () => {
    it('reports isLoading=true with no data or error', () => {
        const store = createStubStore<number>();
        const { result } = renderHook(() => useLiveQueryResult(store));
        expect(result.current.data).toBeUndefined();
        expect(result.current.error).toBeUndefined();
        expect(result.current.isLoading).toBe(true);
        expect(result.current.slot).toBeUndefined();
    });

    it('updates data on store emission', () => {
        const store = createStubStore<number>();
        const { result } = renderHook(() => useLiveQueryResult(store));
        act(() => store.emit(123));
        expect(result.current.data).toBe(123);
        expect(result.current.isLoading).toBe(false);
    });

    it('exposes the slot from the current snapshot', () => {
        const store = createStubStore<number>();
        const { result } = renderHook(() => useLiveQueryResult(store));
        act(() => store.emit(42, undefined, 123n));
        expect(result.current.slot).toBe(123n);
        // Later snapshot at a higher slot: data and slot update together.
        act(() => store.emit(43, undefined, 124n));
        expect(result.current.data).toBe(43);
        expect(result.current.slot).toBe(124n);
    });

    it('surfaces errors and stops loading', () => {
        const store = createStubStore<number>();
        const { result } = renderHook(() => useLiveQueryResult(store));
        const boom = new Error('boom');
        act(() => store.emit(undefined, boom));
        expect(result.current.error).toBe(boom);
        expect(result.current.isLoading).toBe(false);
        // Error-only snapshot has no value, so no slot either.
        expect(result.current.slot).toBeUndefined();
    });
});

describe.skipIf(!__BROWSER__ && !__REACTNATIVE__)('nullLiveStore', () => {
    it('getState returns undefined, subscribe is a no-op', () => {
        const store = nullLiveStore<number>();
        expect(store.getState()).toBeUndefined();
        expect(store.getError()).toBeUndefined();
        const unsub = store.subscribe(() => {});
        expect(typeof unsub).toBe('function');
        unsub();
    });
});
