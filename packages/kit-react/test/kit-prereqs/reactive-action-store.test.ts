import { describe, expect, it, vi } from 'vitest';

import { createReactiveActionStore } from '../../src/kit-prereqs';

describe('createReactiveActionStore', () => {
    it('starts idle and transitions through running to success', async () => {
        const store = createReactiveActionStore<[number], number>((_signal, n) => Promise.resolve(n * 2));
        expect(store.getState()).toEqual({ data: undefined, error: undefined, status: 'idle' });
        const promise = store.dispatchAsync(21);
        expect(store.getState().status).toBe('running');
        await expect(promise).resolves.toBe(42);
        expect(store.getState()).toEqual({ data: 42, error: undefined, status: 'success' });
    });

    it('captures rejections on the error path', async () => {
        const err = new Error('boom');
        const store = createReactiveActionStore<[], never>(() => Promise.reject(err));
        await expect(store.dispatchAsync()).rejects.toBe(err);
        expect(store.getState()).toMatchObject({ error: err, status: 'error' });
    });

    it('fire-and-forget dispatch() never throws but still captures error state', async () => {
        const err = new Error('boom');
        const store = createReactiveActionStore<[], never>(() => Promise.reject(err));
        expect(() => store.dispatch()).not.toThrow();
        // Let the microtask queue drain so the rejection settles into state.
        await Promise.resolve();
        await Promise.resolve();
        expect(store.getState()).toMatchObject({ error: err, status: 'error' });
    });

    it('supersedes the prior dispatch by aborting its signal', async () => {
        const signals: AbortSignal[] = [];
        const store = createReactiveActionStore<[number], number>((signal, delay) => {
            signals.push(signal);
            return new Promise(resolve => {
                const timer = setTimeout(() => resolve(delay), delay);
                signal.addEventListener('abort', () => clearTimeout(timer));
            });
        });

        void store.dispatchAsync(50);
        const second = store.dispatchAsync(1);
        expect(signals[0]?.aborted).toBe(true);
        await expect(second).resolves.toBe(1);
        expect(store.getState()).toMatchObject({ data: 1, status: 'success' });
    });

    it('notifies subscribers on state transitions', async () => {
        const store = createReactiveActionStore<[], number>(() => Promise.resolve(7));
        const listener = vi.fn();
        const unsubscribe = store.subscribe(listener);
        await store.dispatchAsync();
        // at least `running` + `success`.
        expect(listener).toHaveBeenCalled();
        unsubscribe();
    });

    it('reset() aborts in flight and returns to idle', async () => {
        let aborted = false;
        const store = createReactiveActionStore<[], never>(
            signal =>
                new Promise<never>((_, reject) => {
                    signal.addEventListener('abort', () => {
                        aborted = true;
                        reject(new DOMException('aborted', 'AbortError'));
                    });
                }),
        );
        const p = store.dispatchAsync();
        store.reset();
        await expect(p).rejects.toBeTruthy();
        expect(aborted).toBe(true);
        expect(store.getState().status).toBe('idle');
    });

    it('stale-while-revalidate: a running re-dispatch preserves prior data', async () => {
        const pending: Array<(v: number) => void> = [];
        const store = createReactiveActionStore<[], number>(() => new Promise<number>(res => pending.push(res)));
        const first = store.dispatchAsync();
        pending.shift()!(99);
        await first;
        expect(store.getState()).toMatchObject({ data: 99, status: 'success' });

        // Kick a second dispatch — it stays pending; the store should
        // keep reporting the prior data while transitioning to running.
        const second = store.dispatchAsync();
        expect(store.getState()).toMatchObject({ data: 99, status: 'running' });

        // Resolve so the test doesn't leak a hanging promise.
        pending.shift()!(100);
        await second;
        expect(store.getState()).toMatchObject({ data: 100, status: 'success' });
    });
});
