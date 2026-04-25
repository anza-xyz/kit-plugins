import type { Client, ClientPlugin } from '@solana/kit';
import { createClient, extendClient } from '@solana/kit';
import type { ReactNode } from 'react';
import { useMemo } from 'react';

import { KitClientProvider } from '../src/client-context';

/**
 * Build a `ClientPlugin` that extends the client with the given properties.
 * Useful for installing fake capabilities (`rpc`, `payer`, etc.) in tests
 * without reaching for a real transport.
 */
export function mockPlugin<T extends object>(extensions: T): ClientPlugin<object, object> {
    return (client: object) => extendClient(client, extensions);
}

/**
 * Wrap children in a `KitClientProvider` whose client has the supplied
 * extensions installed. Each call to {@link Providers} builds a fresh
 * client, memoized across re-renders of the same wrapper instance so hooks
 * that close over `client` identity stay stable.
 */
export function Providers({ children, extensions }: { children: ReactNode; extensions?: Record<string, unknown> }) {
    const client = useMemo<Client<object>>(
        () => (extensions ? createClient().use(mockPlugin(extensions)) : createClient()),
        // The test callers either pass a stable reference or explicitly
        // want a fresh client per wrapper mount; either way the memo
        // dependency is the raw extensions reference.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [extensions],
    );
    return <KitClientProvider client={client}>{children}</KitClientProvider>;
}

/**
 * Suppress React's error log while running `fn`. Use around assertions for
 * `render`/`renderHook` calls that are expected to throw.
 */
export function expectingError<T>(fn: () => T): T {
    const original = console.error;
    console.error = () => {};
    try {
        return fn();
    } finally {
        console.error = original;
    }
}
