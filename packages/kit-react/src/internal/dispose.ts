/**
 * @internal
 * Tracks clients that have already been disposed so {@link disposeClient} is
 * idempotent. Needed because React 18 StrictMode (and some hot-reload flows)
 * can invoke effect cleanups more than once against the same client ref —
 * calling the underlying disposable twice usually either throws or leaks.
 *
 * `WeakSet` means disposed clients don't leak: once nothing else references
 * the client, the entry is eligible for GC.
 */
const DISPOSED = new WeakSet<object>();

/**
 * @internal
 * Calls `client[Symbol.dispose]()` if the client implements {@link Disposable}.
 * Safe to call on plain clients — no-op in that case. Idempotent: the second
 * and later calls for the same client are no-ops, so StrictMode's mount →
 * cleanup → mount → cleanup sequence doesn't double-dispose.
 */
export function disposeClient(client: object): void {
    if (DISPOSED.has(client)) return;
    DISPOSED.add(client);
    if (typeof (client as Partial<Disposable>)[Symbol.dispose] === 'function') {
        (client as Disposable)[Symbol.dispose]();
    }
}
