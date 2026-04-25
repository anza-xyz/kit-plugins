/**
 * @vitest-environment happy-dom
 */
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useRequest } from '../src/hooks/use-request';
import type { ReactiveActionStore } from '../src/kit-prereqs';
import { fakeActionStore } from './fake-stores';
import { Providers } from './helpers';

function wrapper({ children }: { children: ReactNode }) {
    return <Providers>{children}</Providers>;
}

const IS_LIVE = __BROWSER__ || __REACTNATIVE__;

describe.skipIf(!IS_LIVE)('useRequest (live-client)', () => {
    it('starts in loading until the store emits', () => {
        const store = fakeActionStore<number>();
        const { result } = renderHook(
            () => useRequest(() => ({ reactiveStore: () => store as unknown as ReactiveActionStore<[], number> }), []),
            { wrapper },
        );
        expect(result.current.status).toBe('loading');
        expect(result.current.isLoading).toBe(true);
    });

    it('transitions to loaded on success', () => {
        const store = fakeActionStore<number>();
        const { result } = renderHook(
            () => useRequest(() => ({ reactiveStore: () => store as unknown as ReactiveActionStore<[], number> }), []),
            { wrapper },
        );
        act(() => store.setState({ data: 7, error: undefined, status: 'success' }));
        expect(result.current.status).toBe('loaded');
        expect(result.current.data).toBe(7);
    });

    it('reports retrying (with stale data) on re-dispatch after prior success', () => {
        const store = fakeActionStore<number>();
        const { result } = renderHook(
            () => useRequest(() => ({ reactiveStore: () => store as unknown as ReactiveActionStore<[], number> }), []),
            { wrapper },
        );
        act(() => store.setState({ data: 7, error: undefined, status: 'success' }));
        act(() => store.setState({ data: 7, error: undefined, status: 'running' }));
        expect(result.current.status).toBe('retrying');
        expect(result.current.data).toBe(7); // stale-while-revalidate
    });

    it('surfaces errors', () => {
        const store = fakeActionStore<number>();
        const { result } = renderHook(
            () => useRequest(() => ({ reactiveStore: () => store as unknown as ReactiveActionStore<[], number> }), []),
            { wrapper },
        );
        const err = new Error('nope');
        act(() => store.setState({ data: undefined, error: err, status: 'error' }));
        expect(result.current.status).toBe('error');
        expect(result.current.error).toBe(err);
    });

    it('reports status "disabled" when factory returns null', () => {
        const factory = vi.fn(() => null);
        const { result } = renderHook(() => useRequest(factory, []), { wrapper });
        expect(result.current.status).toBe('disabled');
        expect(result.current.isLoading).toBe(false);
    });

    it('refresh() calls dispatch on the store', () => {
        const store = fakeActionStore<number>();
        const dispatch = vi.fn();
        store.dispatch = dispatch;
        const { result } = renderHook(
            () => useRequest(() => ({ reactiveStore: () => store as unknown as ReactiveActionStore<[], number> }), []),
            { wrapper },
        );
        result.current.refresh();
        expect(dispatch).toHaveBeenCalled();
    });

    it('rebuilds the store when deps change', () => {
        const factory = vi.fn(() => ({ reactiveStore: () => fakeActionStore<number>() }));
        const { rerender } = renderHook(({ dep }: { dep: number }) => useRequest(factory, [dep]), {
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
                useRequest(
                    signal => {
                        signals.push(signal);
                        return { reactiveStore: () => fakeActionStore<number>() };
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

    // TODO(kit#1555): delete this test when Kit ships `.reactiveStore()` on
    // `PendingRpcRequest` and the `reactiveStoreFromPendingRequest` shim is
    // removed. It exercises the adapter path specifically; the native
    // `{ reactiveStore() }` path is already covered by the tests above that
    // use `fakeActionStore`.
    it('accepts a raw PendingRpcRequest and wraps it via the shim', async () => {
        // Fake PendingRpcRequest — has `.send({ abortSignal })` only, no
        // `.reactiveStore()`. The hook should detect the missing method
        // and go through `reactiveStoreFromPendingRequest` internally.
        const send = vi.fn((_opts?: { abortSignal?: AbortSignal }) => Promise.resolve(42));
        const pending = { send };
        const { result } = renderHook(() => useRequest(() => pending, []), { wrapper });
        // The shim auto-dispatches on construction, so send fires immediately.
        expect(send).toHaveBeenCalledTimes(1);
        expect(send.mock.calls[0]?.[0]?.abortSignal).toBeInstanceOf(AbortSignal);
        await act(async () => {
            await Promise.resolve();
        });
        expect(result.current.status).toBe('loaded');
        expect(result.current.data).toBe(42);
    });
});

describe.skipIf(IS_LIVE)('useRequest (SSR / node)', () => {
    it('never runs the factory and reports disabled', () => {
        const factory = vi.fn(() => ({ reactiveStore: () => fakeActionStore<number>() }));
        const { result } = renderHook(() => useRequest(factory, []), { wrapper });
        expect(factory).not.toHaveBeenCalled();
        expect(result.current.status).toBe('disabled');
    });
});
