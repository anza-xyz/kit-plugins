/**
 * @vitest-environment happy-dom
 */
import type { Slot, SolanaRpcResponse } from '@solana/kit';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useSubscription } from '../src/hooks/use-subscription';
import type { ReactiveStreamStore } from '../src/kit-prereqs';
import { fakeStreamStore } from './fake-stores';
import { Providers } from './helpers';

function wrapper({ children }: { children: ReactNode }) {
    return <Providers>{children}</Providers>;
}

// useLiveStore only builds the factory's store in a live-client environment
// (browser / react-native). In node it short-circuits to a permanent loading
// store so SSR matches the first client render — the suite below exercises
// the live path, so skip it in node. The separate `describe` further down
// locks in the SSR behavior explicitly.
const IS_LIVE = __BROWSER__ || __REACTNATIVE__;

describe.skipIf(!IS_LIVE)('useSubscription (live-client)', () => {
    it('reports loading before the first emit', () => {
        const store = fakeStreamStore<number>();
        const { result } = renderHook(
            () => useSubscription(() => ({ reactiveStore: () => store as unknown as ReactiveStreamStore<number> }), []),
            { wrapper },
        );
        expect(result.current.status).toBe('loading');
        expect(result.current.isLoading).toBe(true);
        expect(result.current.data).toBeUndefined();
    });

    it('forwards raw-value emissions with slot undefined', () => {
        const store = fakeStreamStore<number>();
        const { result } = renderHook(
            () => useSubscription(() => ({ reactiveStore: () => store as unknown as ReactiveStreamStore<number> }), []),
            { wrapper },
        );
        act(() => store.emit(42));
        expect(result.current.data).toBe(42);
        expect(result.current.slot).toBeUndefined();
        expect(result.current.status).toBe('loaded');
    });

    it('unwraps SolanaRpcResponse envelopes into data + slot', () => {
        const store = fakeStreamStore<SolanaRpcResponse<string>>();
        const { result } = renderHook(
            () =>
                useSubscription<SolanaRpcResponse<string>>(
                    () => ({ reactiveStore: () => store as unknown as ReactiveStreamStore<SolanaRpcResponse<string>> }),
                    [],
                ),
            { wrapper },
        );
        act(() =>
            store.emit({
                context: { slot: 123n as Slot },
                value: 'hello',
            }),
        );
        expect(result.current.data).toBe('hello');
        expect(result.current.slot).toBe(123n);
    });

    it('surfaces errors', () => {
        const store = fakeStreamStore<number>();
        const { result } = renderHook(
            () => useSubscription(() => ({ reactiveStore: () => store as unknown as ReactiveStreamStore<number> }), []),
            { wrapper },
        );
        const err = new Error('boom');
        act(() => store.fail(err));
        expect(result.current.status).toBe('error');
        expect(result.current.error).toBe(err);
    });

    it('reports status "disabled" when factory returns null, and does not call reactiveStore', () => {
        const reactiveStore = vi.fn();
        const { result } = renderHook(() => useSubscription(() => null, []), { wrapper });
        expect(result.current.status).toBe('disabled');
        expect(result.current.isLoading).toBe(false);
        expect(reactiveStore).not.toHaveBeenCalled();
    });

    it('passes an AbortSignal to the factory and aborts on unmount', () => {
        let capturedSignal: AbortSignal | undefined;
        const store = fakeStreamStore<number>();
        const { unmount } = renderHook(
            () =>
                useSubscription(signal => {
                    capturedSignal = signal;
                    return { reactiveStore: () => store as unknown as ReactiveStreamStore<number> };
                }, []),
            { wrapper },
        );
        expect(capturedSignal?.aborted).toBe(false);
        unmount();
        expect(capturedSignal?.aborted).toBe(true);
    });

    it('rebuilds the store when deps change', () => {
        const factory = vi.fn(() => ({ reactiveStore: () => fakeStreamStore<number>() }));
        const { rerender } = renderHook(({ dep }: { dep: number }) => useSubscription(factory, [dep]), {
            initialProps: { dep: 1 },
            wrapper,
        });
        expect(factory).toHaveBeenCalledTimes(1);
        rerender({ dep: 2 });
        expect(factory).toHaveBeenCalledTimes(2);
    });

    it('aborts the prior signal when deps change', () => {
        const signals: AbortSignal[] = [];
        const { rerender } = renderHook(
            ({ dep }: { dep: number }) =>
                useSubscription(
                    signal => {
                        signals.push(signal);
                        return { reactiveStore: () => fakeStreamStore<number>() };
                    },
                    [dep],
                ),
            { initialProps: { dep: 1 }, wrapper },
        );
        expect(signals[0]!.aborted).toBe(false);
        rerender({ dep: 2 });
        expect(signals[0]!.aborted).toBe(true);
        expect(signals[1]!.aborted).toBe(false);
    });

    it('retry() transitions error status to retrying (and preserves stale data)', () => {
        const store = fakeStreamStore<number>();
        const { result } = renderHook(
            () => useSubscription(() => ({ reactiveStore: () => store as unknown as ReactiveStreamStore<number> }), []),
            { wrapper },
        );
        act(() => store.emit(7));
        act(() => store.fail(new Error('boom')));
        expect(result.current.status).toBe('error');
        act(() => result.current.retry());
        expect(result.current.status).toBe('retrying');
        expect(result.current.data).toBe(7); // stale value preserved
    });
});

describe.skipIf(IS_LIVE)('useSubscription (SSR / node)', () => {
    it('never runs the factory and reports loading', () => {
        const factory = vi.fn(() => ({ reactiveStore: () => fakeStreamStore<number>() }));
        const { result } = renderHook(() => useSubscription(factory, []), { wrapper });
        expect(factory).not.toHaveBeenCalled();
        expect(result.current.status).toBe('loading');
    });
});
