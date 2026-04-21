import { createClient } from '@solana/kit';
import { vi } from 'vitest';

/**
 * @internal
 * Minimal deferred — controllable promise for test setup.
 */
export function createDeferred<T>(): {
    promise: Promise<T>;
    reject: (err: unknown) => void;
    resolve: (v: T) => void;
} {
    let resolve!: (v: T) => void;
    let reject!: (err: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, reject, resolve };
}

/**
 * @internal
 * A stub `PendingRpcRequest` — `.send()` returns a caller-controlled promise.
 * Use {@link createDeferred} (or equivalent) to control resolution from the test.
 */
export function stubRpcRequest<T>(sendImpl: (config?: { abortSignal?: AbortSignal }) => Promise<T>) {
    return { send: vi.fn(sendImpl) };
}

/**
 * @internal
 * A stub `PendingRpcSubscriptionsRequest` — `.subscribe()` returns an async
 * iterable that the test can push notifications into via `push` / `end` /
 * `throwError`.
 */
export function stubRpcSubscription<T>(): {
    end: () => void;
    push: (value: T) => void;
    request: { subscribe: ReturnType<typeof vi.fn> };
    throwError: (err: unknown) => void;
} {
    const queue: T[] = [];
    let resolvers: Array<(r: IteratorResult<T>) => void> = [];
    let done = false;
    let error: unknown = null;

    const push = (value: T) => {
        if (resolvers.length > 0) {
            resolvers.shift()!({ done: false, value });
        } else {
            queue.push(value);
        }
    };
    const end = () => {
        done = true;
        const pending = resolvers;
        resolvers = [];
        pending.forEach(r => r({ done: true, value: undefined as never }));
    };
    const throwError = (err: unknown) => {
        error = err;
        const pending = resolvers;
        resolvers = [];
        pending.forEach(r => r({ done: true, value: undefined as never }));
    };

    const iterable: AsyncIterable<T> = {
        [Symbol.asyncIterator]() {
            return {
                next(): Promise<IteratorResult<T>> {
                    if (error) {
                        const e = error;
                        error = null;
                        if (e instanceof Error) return Promise.reject(e);
                        return Promise.reject(new Error(typeof e === 'string' ? e : JSON.stringify(e)));
                    }
                    if (queue.length > 0) {
                        return Promise.resolve({ done: false, value: queue.shift() as T });
                    }
                    if (done) return Promise.resolve({ done: true, value: undefined as never });
                    return new Promise(r => resolvers.push(r));
                },
                return(): Promise<IteratorResult<T>> {
                    done = true;
                    return Promise.resolve({ done: true, value: undefined as never });
                },
            };
        },
    };

    return {
        end,
        push,
        request: { subscribe: vi.fn((_config?: { abortSignal?: AbortSignal }) => Promise.resolve(iterable)) },
        throwError,
    };
}

/**
 * @internal
 * Returns `{context: {slot}, value}` — the `SolanaRpcResponse` envelope shape
 * that the real RPC returns.
 */
export function rpcResponse<T>(value: T, slot = 0n): { context: { slot: bigint }; value: T } {
    return { context: { slot }, value };
}

/**
 * @internal
 * Builds a minimal client object with `rpc` + `rpcSubscriptions` shims. Tests
 * pass their own method implementations via the `rpc` / `rpcSubscriptions`
 * records; anything not supplied will throw on access.
 */
export function createClientWithRpc(options: {
    rpc?: Record<string, (...args: unknown[]) => unknown>;
    rpcSubscriptions?: Record<string, (...args: unknown[]) => unknown>;
}) {
    return createClient().use(client => ({
        ...client,
        rpc: options.rpc ?? {},
        rpcSubscriptions: options.rpcSubscriptions ?? {},
    }));
}
