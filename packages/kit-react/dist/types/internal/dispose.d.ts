/**
 * @internal
 * Calls `client[Symbol.dispose]()` if the client implements {@link Disposable}.
 * Safe to call on plain clients — no-op in that case. Idempotent: the second
 * and later calls for the same client are no-ops, so StrictMode's mount →
 * cleanup → mount → cleanup sequence doesn't double-dispose.
 */
export declare function disposeClient(client: object): void;
//# sourceMappingURL=dispose.d.ts.map