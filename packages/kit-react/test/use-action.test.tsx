/**
 * @vitest-environment happy-dom
 */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { KitClientProvider } from '../src/client-context';
import { useAction } from '../src/hooks/use-action';

function wrapper({ children }: { children: React.ReactNode }) {
    return <KitClientProvider>{children}</KitClientProvider>;
}

describe('useAction', () => {
    it('starts in idle state and transitions through running to success', async () => {
        const { result } = renderHook(() => useAction<[number], number>(async (_s, n) => n + 1), { wrapper });
        expect(result.current.isIdle).toBe(true);
        expect(result.current.data).toBeUndefined();
        await act(async () => {
            const value = await result.current.sendAsync(2);
            expect(value).toBe(3);
        });
        expect(result.current.isSuccess).toBe(true);
        expect(result.current.data).toBe(3);
    });

    it('fire-and-forget send() never throws but state captures the error', async () => {
        const err = new Error('nope');
        const { result } = renderHook(() => useAction<[], never>(() => Promise.reject(err)), { wrapper });
        await act(async () => {
            result.current.send();
        });
        expect(result.current.isError).toBe(true);
        expect(result.current.error).toBe(err);
    });

    it('sendAsync() propagates errors', async () => {
        const err = new Error('nope');
        const { result } = renderHook(() => useAction<[], never>(() => Promise.reject(err)), { wrapper });
        await act(async () => {
            await result.current.sendAsync().catch(() => {});
        });
        expect(result.current.isError).toBe(true);
        expect(result.current.error).toBe(err);
    });

    it('reset() returns to idle', async () => {
        const { result } = renderHook(() => useAction<[], number>(async () => 1), { wrapper });
        await act(async () => {
            await result.current.sendAsync();
        });
        expect(result.current.isSuccess).toBe(true);
        await act(async () => {
            result.current.reset();
        });
        expect(result.current.isIdle).toBe(true);
    });

    it('a second dispatch aborts the first in-flight signal (abort-on-supersede)', async () => {
        // Capture the AbortSignal from each invocation, and the resolver for
        // the first one, so we can verify the first signal aborts when the
        // second dispatch fires.
        const signals: AbortSignal[] = [];
        const op = (signal: AbortSignal, n: number) => {
            signals.push(signal);
            if (n === 1) {
                // First dispatch hangs until aborted.
                return new Promise<number>(resolve => {
                    signal.addEventListener('abort', () => resolve(-1));
                });
            }
            return Promise.resolve(n);
        };
        const { result } = renderHook(() => useAction<[number], number>(op), { wrapper });
        act(() => {
            result.current.send(1);
        });
        expect(signals).toHaveLength(1);
        expect(signals[0]!.aborted).toBe(false);
        await act(async () => {
            await result.current.sendAsync(2);
        });
        expect(signals).toHaveLength(2);
        expect(signals[0]!.aborted).toBe(true);
        expect(signals[1]!.aborted).toBe(false);
        expect(result.current.data).toBe(2);
    });

    it('preserves stale data during retrying (running after prior success)', async () => {
        // First dispatch returns 42 immediately. Second dispatch returns a
        // hanging promise whose resolver we keep so we can settle it later.
        let call = 0;
        let resolveSecond!: (n: number) => void;
        const op = () => {
            call += 1;
            if (call === 1) return Promise.resolve(42);
            return new Promise<number>(resolve => {
                resolveSecond = resolve;
            });
        };
        const { result } = renderHook(() => useAction<[], number>(op), { wrapper });
        await act(async () => {
            await result.current.sendAsync();
        });
        expect(result.current.data).toBe(42);
        expect(result.current.isSuccess).toBe(true);
        act(() => {
            result.current.send();
        });
        expect(result.current.isRunning).toBe(true);
        expect(result.current.data).toBe(42); // stale-while-revalidate
        await act(async () => {
            resolveSecond(100);
        });
        expect(result.current.data).toBe(100);
    });
});
