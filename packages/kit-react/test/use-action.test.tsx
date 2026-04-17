import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useAction } from '../src';

describe.skipIf(!__BROWSER__ && !__REACTNATIVE__)('useAction', () => {
    it('starts idle with no data or error', () => {
        const { result } = renderHook(() => useAction(async () => 42));
        expect(result.current.status).toBe('idle');
        expect(result.current.data).toBeUndefined();
        expect(result.current.error).toBeUndefined();
    });

    it('transitions idle → sending → success on a successful call', async () => {
        let resolveFn: (v: number) => void = () => {};
        const fn = vi.fn(() => new Promise<number>(r => (resolveFn = r)));
        const { result } = renderHook(() => useAction(fn));

        let pending!: Promise<number>;
        act(() => {
            pending = result.current.send();
        });
        expect(result.current.status).toBe('sending');
        expect(result.current.data).toBeUndefined();

        await act(async () => {
            resolveFn(7);
            await pending;
        });
        expect(result.current.status).toBe('success');
        expect(result.current.data).toBe(7);
        expect(result.current.error).toBeUndefined();
    });

    it('transitions to error and rethrows on failure', async () => {
        const boom = new Error('nope');
        const fn = vi.fn().mockRejectedValue(boom);
        const { result } = renderHook(() => useAction(fn));

        let caught: unknown;
        await act(async () => {
            try {
                await result.current.send();
            } catch (e) {
                caught = e;
            }
        });
        expect(caught).toBe(boom);
        expect(result.current.status).toBe('error');
        expect(result.current.error).toBe(boom);
        expect(result.current.data).toBeUndefined();
    });

    it('reset() returns state back to idle', async () => {
        const { result } = renderHook(() => useAction(async () => 'ok'));
        await act(async () => {
            await result.current.send();
        });
        expect(result.current.status).toBe('success');

        act(() => result.current.reset());
        expect(result.current.status).toBe('idle');
        expect(result.current.data).toBeUndefined();
    });

    it('only the most recent in-flight call updates state', async () => {
        let resolveA: (v: string) => void = () => {};
        let resolveB: (v: string) => void = () => {};
        const fn = vi
            .fn<() => Promise<string>>()
            .mockImplementationOnce(() => new Promise(r => (resolveA = r)))
            .mockImplementationOnce(() => new Promise(r => (resolveB = r)));
        const { result } = renderHook(() => useAction(fn));

        let pendingA!: Promise<string>;
        let pendingB!: Promise<string>;
        act(() => {
            pendingA = result.current.send();
            pendingB = result.current.send();
        });

        // First call resolves but is stale — no state update.
        await act(async () => {
            resolveA('first');
            await pendingA;
        });
        expect(result.current.status).toBe('sending');

        await act(async () => {
            resolveB('second');
            await pendingB;
        });
        expect(result.current.status).toBe('success');
        expect(result.current.data).toBe('second');
    });

    it('returns a stable send reference across renders', () => {
        const fn = vi.fn();
        const { result, rerender } = renderHook(() => useAction(fn));
        const firstSend = result.current.send;
        rerender();
        expect(result.current.send).toBe(firstSend);
    });
});
