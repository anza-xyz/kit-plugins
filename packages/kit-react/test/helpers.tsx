import type { ClientPlugin } from '@solana/kit';
import { extendClient } from '@solana/kit';
import type { ReactNode } from 'react';

import { KitClientProvider } from '../src/client-context';
import { PluginProvider } from '../src/providers/plugin-provider';

/**
 * Build a `ClientPlugin` that extends the client with the given properties.
 * Useful for installing fake capabilities (`rpc`, `payer`, etc.) in tests
 * without reaching for a real transport.
 */
export function mockPlugin<T extends object>(extensions: T): ClientPlugin<object, object> {
    return (client: object) => extendClient(client, extensions);
}

/**
 * Wrap children in a `KitClientProvider` plus (optionally) a
 * `PluginProvider` installing the supplied extensions. Call sites in tests
 * can pass the extensions inline instead of constructing a full plugin
 * chain.
 */
export function Providers({ children, extensions }: { children: ReactNode; extensions?: Record<string, unknown> }) {
    const inner = extensions ? (
        <PluginProvider plugins={[mockPlugin(extensions)]}>{children}</PluginProvider>
    ) : (
        children
    );
    return <KitClientProvider>{inner}</KitClientProvider>;
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
