import { useEffect } from 'react';

/**
 * Calls `client[Symbol.dispose]()` on unmount when the disposable contract
 * is present. Used by {@link KitClientProvider} to tear down a client it
 * created itself (but not one the caller passed in — ownership switches
 * with the `client` prop).
 *
 * @internal
 */
export function useDisposeOnUnmount(client: object, owned: boolean): void {
    useEffect(() => {
        if (!owned) return;
        return () => {
            const disposable = (client as Partial<Disposable>)[Symbol.dispose];
            if (typeof disposable === 'function') disposable.call(client);
        };
    }, [client, owned]);
}
