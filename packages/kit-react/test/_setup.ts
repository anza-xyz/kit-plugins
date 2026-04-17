import { createClient } from '@solana/kit';
import type { WalletNamespace, WalletState, WalletStatus } from '@solana/kit-plugin-wallet';
import { vi } from 'vitest';

/**
 * Creates a mutable fake {@link WalletNamespace} suitable for plugging into a
 * Kit client for hook tests. Tests can drive re-renders by calling
 * `setState(partial)` which updates the state and notifies subscribers.
 */
export function createFakeWallet(initial: Partial<WalletState> = {}): {
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    /** Snapshot the current state (shallow copy). */
    getCurrent: () => WalletState;
    /** How many listeners are currently subscribed. */
    listenerCount: () => number;
    namespace: WalletNamespace;
    selectAccount: ReturnType<typeof vi.fn>;
    /** Merge a patch into the state and notify subscribers. */
    setState: (patch: Partial<WalletState>) => void;
    signIn: ReturnType<typeof vi.fn>;
    signMessage: ReturnType<typeof vi.fn>;
} {
    let state: WalletState = {
        connected: null,
        status: 'disconnected' as WalletStatus,
        wallets: [],
        ...initial,
    };
    const listeners = new Set<() => void>();

    const connect = vi.fn().mockResolvedValue([]);
    const disconnect = vi.fn().mockResolvedValue(undefined);
    const selectAccount = vi.fn();
    const signIn = vi.fn().mockResolvedValue({});
    const signMessage = vi.fn().mockResolvedValue(new Uint8Array(64));

    const namespace: WalletNamespace = {
        connect,
        disconnect,
        getState: () => state,
        selectAccount,
        signIn,
        signMessage,
        subscribe: listener => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };

    return {
        connect,
        disconnect,
        getCurrent: () => state,
        listenerCount: () => listeners.size,
        namespace,
        selectAccount,
        setState: patch => {
            state = { ...state, ...patch };
            listeners.forEach(l => l());
        },
        signIn,
        signMessage,
    };
}

/** Creates a Kit client with the given wallet namespace attached. */
export function createClientWithWallet(wallet: WalletNamespace) {
    return createClient().use(client => ({ ...client, wallet }));
}
