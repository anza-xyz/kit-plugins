import { type TransactionSigner } from '@solana/kit';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ClientContext, useIdentity, usePayer } from '../src';

const staticSigner = { address: '11111111111111111111111111111111' } as unknown as TransactionSigner;
const walletSigner = { address: '22222222222222222222222222222222' } as unknown as TransactionSigner;

function wrap(client: object): (props: { children: ReactNode }) => ReactNode {
    return ({ children }) => <ClientContext.Provider value={client as never}>{children}</ClientContext.Provider>;
}

/**
 * Minimal reactive fake: a value + listener set + `onChange` subscribe. The
 * signer hooks duck-type on `client.subscribeToPayer` / `client.subscribeToIdentity`,
 * so tests can simulate a reactive capability without pulling in a full wallet
 * namespace.
 */
function makeReactiveCapability(): {
    listeners: Set<() => void>;
    notify: () => void;
    onChange: (listener: () => void) => () => void;
} {
    const listeners = new Set<() => void>();
    return {
        listeners,
        notify: () => listeners.forEach(l => l()),
        onChange: (listener: () => void) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };
}

/**
 * Build a client whose `payer` getter throws while "disconnected" and returns
 * the wallet signer while "connected" — the shape the wallet plugin installs.
 * Uses a mutable boolean driven by the test rather than a full wallet store.
 */
function makeWalletBackedClient(): {
    client: object;
    connect: () => void;
    disconnect: () => void;
} {
    let connected = false;
    const capability = makeReactiveCapability();
    const client = Object.defineProperty({ subscribeToPayer: capability.onChange }, 'payer', {
        configurable: true,
        enumerable: true,
        get() {
            if (!connected) throw new Error('no wallet connected');
            return walletSigner;
        },
    });
    return {
        client,
        connect: () => {
            connected = true;
            capability.notify();
        },
        disconnect: () => {
            connected = false;
            capability.notify();
        },
    };
}

describe.skipIf(!__BROWSER__ && !__REACTNATIVE__)('usePayer', () => {
    it('throws a capability error when no payer plugin is installed', () => {
        const client = {} as never;
        expect(() => renderHook(() => usePayer(), { wrapper: wrap(client) })).toThrow(/`client.payer`/);
    });

    it('returns a static signer set by PayerProvider-style plugins', () => {
        const client = { payer: staticSigner } as never;
        const { result } = renderHook(() => usePayer(), { wrapper: wrap(client) });
        expect(result.current).toBe(staticSigner);
    });

    it('returns null for a wallet-backed payer when no wallet is connected', () => {
        const { client } = makeWalletBackedClient();
        const { result } = renderHook(() => usePayer(), { wrapper: wrap(client) });
        expect(result.current).toBeNull();
    });

    it('re-renders with the wallet signer when the wallet connects', () => {
        const { client, connect } = makeWalletBackedClient();
        const { result } = renderHook(() => usePayer(), { wrapper: wrap(client) });
        expect(result.current).toBeNull();

        act(() => connect());
        expect(result.current).toBe(walletSigner);
    });
});

describe.skipIf(!__BROWSER__ && !__REACTNATIVE__)('useIdentity', () => {
    it('throws a capability error when no identity plugin is installed', () => {
        const client = {} as never;
        expect(() => renderHook(() => useIdentity(), { wrapper: wrap(client) })).toThrow(/`client.identity`/);
    });

    it('returns a static signer set by IdentityProvider-style plugins', () => {
        const client = { identity: staticSigner } as never;
        const { result } = renderHook(() => useIdentity(), { wrapper: wrap(client) });
        expect(result.current).toBe(staticSigner);
    });

    it('re-renders when subscribeToIdentity fires, independent of client.wallet', () => {
        // Prove the hook duck-types on `subscribeToIdentity` rather than
        // reaching for `client.wallet.subscribe` — no `wallet` is attached.
        let currentSigner: TransactionSigner | null = null;
        const capability = makeReactiveCapability();
        const client = Object.defineProperty({ subscribeToIdentity: capability.onChange }, 'identity', {
            configurable: true,
            enumerable: true,
            get() {
                if (!currentSigner) throw new Error('no identity');
                return currentSigner;
            },
        });

        const { result } = renderHook(() => useIdentity(), { wrapper: wrap(client) });
        expect(result.current).toBeNull();

        act(() => {
            currentSigner = walletSigner;
            capability.notify();
        });
        expect(result.current).toBe(walletSigner);
    });
});

// Node-only: verifies the signer hooks render during SSR without throwing.
// `useSyncExternalStore` requires `getServerSnapshot` on the server — without
// it, React throws during server render with "Missing getServerSnapshot".
describe.skipIf(__BROWSER__ || __REACTNATIVE__)('signer hooks (SSR)', () => {
    function Probe({ hook }: { hook: () => TransactionSigner | null }) {
        const value = hook();
        return <span data-testid="v">{value?.address ?? 'null'}</span>;
    }

    it('usePayer renders on the server with a static signer', () => {
        const html = renderToString(
            <ClientContext.Provider value={{ payer: staticSigner } as never}>
                <Probe hook={usePayer} />
            </ClientContext.Provider>,
        );
        expect(html).toContain(staticSigner.address);
    });

    it('usePayer renders on the server as null when payer is unreachable', () => {
        // Wallet-backed client: `payer` getter throws because nothing is connected
        // on the server. The hook's try/catch should return null.
        const client = Object.defineProperty({ subscribeToPayer: () => () => {} }, 'payer', {
            configurable: true,
            enumerable: true,
            get() {
                throw new Error('no wallet connected');
            },
        });
        const html = renderToString(
            <ClientContext.Provider value={client as never}>
                <Probe hook={usePayer} />
            </ClientContext.Provider>,
        );
        expect(html).toContain('null');
    });

    it('useIdentity renders on the server with a static signer', () => {
        const html = renderToString(
            <ClientContext.Provider value={{ identity: staticSigner } as never}>
                <Probe hook={useIdentity} />
            </ClientContext.Provider>,
        );
        expect(html).toContain(staticSigner.address);
    });
});
