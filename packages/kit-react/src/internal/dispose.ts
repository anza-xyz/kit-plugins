/**
 * @internal
 * Calls `client[Symbol.dispose]()` if the client implements {@link Disposable}.
 * Safe to call on plain clients — no-op in that case.
 */
export function disposeClient(client: object): void {
    if (typeof (client as Partial<Disposable>)[Symbol.dispose] === 'function') {
        (client as Disposable)[Symbol.dispose]();
    }
}
