import { describe, expect, it } from 'vitest';

import { shimUsePromise, usePromise } from '../src/internal/use-promise';

describe('shimUsePromise (React 18 fallback)', () => {
    it('throws the promise itself while pending', () => {
        const promise = new Promise<string>(() => {});
        let thrown: unknown;
        try {
            shimUsePromise(promise);
        } catch (e) {
            thrown = e;
        }
        expect(thrown).toBe(promise);
    });

    it('returns the resolved value once the promise has fulfilled', async () => {
        const promise = Promise.resolve('hello');
        try {
            shimUsePromise(promise);
        } catch {
            /* expected — initial call is before the microtask fires */
        }
        await promise;
        expect(shimUsePromise(promise)).toBe('hello');
    });

    it('throws the rejection reason once the promise has rejected', async () => {
        const reason = new Error('boom');
        const promise = Promise.reject(reason);
        try {
            shimUsePromise(promise);
        } catch {
            /* expected — initial call throws the promise itself */
        }
        await promise.catch(() => {});
        expect(() => shimUsePromise(promise)).toThrow(reason);
    });

    it('caches per-promise so re-calls after fulfillment skip the throw', async () => {
        const promise = Promise.resolve(42);
        try {
            shimUsePromise(promise);
        } catch {
            /* prime the cache */
        }
        await promise;
        // Multiple subsequent calls should all return the same value
        // synchronously without throwing — proves the WeakMap cache is
        // doing its job rather than re-throwing on every render.
        expect(shimUsePromise(promise)).toBe(42);
        expect(shimUsePromise(promise)).toBe(42);
        expect(shimUsePromise(promise)).toBe(42);
    });

    it('different promises maintain independent cache entries', async () => {
        const p1 = Promise.resolve('a');
        const p2 = Promise.resolve('b');
        try {
            shimUsePromise(p1);
        } catch {
            /* prime */
        }
        try {
            shimUsePromise(p2);
        } catch {
            /* prime */
        }
        await Promise.all([p1, p2]);
        expect(shimUsePromise(p1)).toBe('a');
        expect(shimUsePromise(p2)).toBe('b');
    });
});

describe('usePromise (auto-detected React.use vs shim)', () => {
    it('exposes a function regardless of React version', () => {
        // Sanity: the runtime detection picks one of two callables. The
        // test environment runs React 19 so this is `React.use`; on 18 it
        // would be `shimUsePromise`. Either way it is callable.
        expect(typeof usePromise).toBe('function');
    });
});
