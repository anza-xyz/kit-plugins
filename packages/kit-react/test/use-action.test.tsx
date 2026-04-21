import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { isAbortError, useAction } from '../src';

describe.skipIf(!__BROWSER__ && !__REACTNATIVE__)('useAction', () => {
    it('starts idle with no data or error', () => {
        const { result } = renderHook(() => useAction(() => Promise.resolve(42)));
        expect(result.current.status).toBe('idle');
        expect(result.current.data).toBeUndefined();
        expect(result.current.error).toBeUndefined();
    });

    it('exposes `is{Idle,Running,Success,Error}` booleans derived from status', async () => {
        let resolveFn: (v: number) => void = () => {};
        const fn = vi.fn((_signal: AbortSignal) => new Promise<number>(r => (resolveFn = r)));
        const { result } = renderHook(() => useAction(fn));

        // idle
        expect(result.current.isIdle).toBe(true);
        expect(result.current.isRunning).toBe(false);
        expect(result.current.isSuccess).toBe(false);
        expect(result.current.isError).toBe(false);

        // running
        let pending!: Promise<number>;
        act(() => {
            pending = result.current.send();
        });
        expect(result.current.isIdle).toBe(false);
        expect(result.current.isRunning).toBe(true);
        expect(result.current.isSuccess).toBe(false);
        expect(result.current.isError).toBe(false);

        // success
        await act(async () => {
            resolveFn(1);
            await pending;
        });
        expect(result.current.isIdle).toBe(false);
        expect(result.current.isRunning).toBe(false);
        expect(result.current.isSuccess).toBe(true);
        expect(result.current.isError).toBe(false);
    });

    it('sets isError after a rejected send', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('boom'));
        const { result } = renderHook(() => useAction(fn));

        await act(async () => {
            await result.current.send().catch(() => undefined);
        });
        expect(result.current.isError).toBe(true);
        expect(result.current.isRunning).toBe(false);
        expect(result.current.isSuccess).toBe(false);
        expect(result.current.isIdle).toBe(false);
    });

    it('isAbortError detects the superseded-call rejection shape', () => {
        const abort = new Error('aborted');
        abort.name = 'AbortError';
        expect(isAbortError(abort)).toBe(true);
        expect(isAbortError(new Error('regular'))).toBe(false);
        expect(isAbortError('AbortError')).toBe(false);
        expect(isAbortError(null)).toBe(false);
    });

    it('transitions idle → running → success on a successful call', async () => {
        let resolveFn: (v: number) => void = () => {};
        const fn = vi.fn((_signal: AbortSignal) => new Promise<number>(r => (resolveFn = r)));
        const { result } = renderHook(() => useAction(fn));

        let pending!: Promise<number>;
        act(() => {
            pending = result.current.send();
        });
        expect(result.current.status).toBe('running');
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
        const { result } = renderHook(() => useAction(() => Promise.resolve('ok')));
        await act(async () => {
            await result.current.send();
        });
        expect(result.current.status).toBe('success');

        act(() => result.current.reset());
        expect(result.current.status).toBe('idle');
        expect(result.current.data).toBeUndefined();
    });

    it('passes an AbortSignal as the first argument to fn', async () => {
        const fn = vi.fn((_signal: AbortSignal) => Promise.resolve('ok'));
        const { result } = renderHook(() => useAction(fn));

        await act(async () => {
            await result.current.send();
        });

        expect(fn).toHaveBeenCalledOnce();
        const firstArg = fn.mock.calls[0]?.[0];
        expect(firstArg).toBeInstanceOf(AbortSignal);
        expect(firstArg?.aborted).toBe(false);
    });

    it('aborts a prior in-flight call when send is called again', async () => {
        let resolveA: (v: string) => void = () => {};
        let resolveB: (v: string) => void = () => {};
        const fn = vi
            .fn<(signal: AbortSignal) => Promise<string>>()
            .mockImplementationOnce(() => new Promise(r => (resolveA = r)))
            .mockImplementationOnce(() => new Promise(r => (resolveB = r)));
        const { result } = renderHook(() => useAction(fn));

        let pendingA!: Promise<string>;
        let pendingB!: Promise<string>;
        act(() => {
            pendingA = result.current.send();
            pendingB = result.current.send();
        });

        // The first send was superseded — its signal is aborted.
        const firstSignal = fn.mock.calls[0]?.[0];
        expect(firstSignal?.aborted).toBe(true);

        // The first await rejects with AbortError even though the underlying
        // fn eventually resolves.
        let caughtA: unknown;
        await act(async () => {
            resolveA('first');
            try {
                await pendingA;
            } catch (e) {
                caughtA = e;
            }
        });
        expect((caughtA as Error | undefined)?.name).toBe('AbortError');

        // State was not touched by the stale resolution.
        expect(result.current.status).toBe('running');

        // The second call completes normally.
        await act(async () => {
            resolveB('second');
            await pendingB;
        });
        expect(result.current.status).toBe('success');
        expect(result.current.data).toBe('second');
    });

    it('does not surface a stale error from a superseded call', async () => {
        let rejectA: (e: unknown) => void = () => {};
        let resolveB: (v: string) => void = () => {};
        const fn = vi
            .fn<(signal: AbortSignal) => Promise<string>>()
            .mockImplementationOnce(() => new Promise((_, r) => (rejectA = r)))
            .mockImplementationOnce(() => new Promise(r => (resolveB = r)));
        const { result } = renderHook(() => useAction(fn));

        let pendingA!: Promise<string>;
        let pendingB!: Promise<string>;
        act(() => {
            pendingA = result.current.send();
            pendingB = result.current.send();
        });

        // Stale call rejects late — should not move state into 'error'.
        await act(async () => {
            rejectA(new Error('stale boom'));
            await pendingA.catch(() => undefined);
        });
        expect(result.current.status).toBe('running');
        expect(result.current.error).toBeUndefined();

        await act(async () => {
            resolveB('second');
            await pendingB;
        });
        expect(result.current.status).toBe('success');
        expect(result.current.data).toBe('second');
    });

    it('reset() aborts an in-flight call', async () => {
        let resolveFn: (v: string) => void = () => {};
        const fn = vi.fn((_signal: AbortSignal) => new Promise<string>(r => (resolveFn = r)));
        const { result } = renderHook(() => useAction(fn));

        let pending!: Promise<string>;
        act(() => {
            pending = result.current.send();
        });
        expect(result.current.status).toBe('running');

        act(() => result.current.reset());
        expect(result.current.status).toBe('idle');

        // A late resolution after reset should not move state back to success.
        let caught: unknown;
        await act(async () => {
            resolveFn('late');
            try {
                await pending;
            } catch (e) {
                caught = e;
            }
        });
        expect((caught as Error | undefined)?.name).toBe('AbortError');
        expect(result.current.status).toBe('idle');
    });

    it('returns a stable send reference across renders', () => {
        const fn = vi.fn();
        const { result, rerender } = renderHook(() => useAction(fn));
        const firstSend = result.current.send;
        rerender();
        expect(result.current.send).toBe(firstSend);
    });
});
