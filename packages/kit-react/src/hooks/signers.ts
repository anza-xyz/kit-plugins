import type { ClientWithIdentity, ClientWithPayer, TransactionSigner } from '@solana/kit';
import { useSyncExternalStore } from 'react';

import { useClient } from '../client-context';
import { throwMissingCapability } from '../internal/errors';

/**
 * @internal No-op subscribe for `useSyncExternalStore` when the client doesn't
 * advertise a change hook for the capability — keeps the hook call
 * unconditional while falling back to a static read.
 */
const NOOP_SUBSCRIBE = () => () => {};

/**
 * @internal Convention used by this package to observe capability changes
 * without naming the plugin that installs them. A plugin whose capability
 * (`payer`, `identity`, …) can change over time installs a sibling
 * `subscribeTo<Capability>` function; consumers subscribe to it and re-read
 * the capability to get the current value.
 */
type SubscribeToCapability<TKey extends string> = {
    readonly [K in `subscribeTo${Capitalize<TKey>}`]?: (listener: () => void) => () => void;
};

/**
 * @internal Reads a capability whose getter may throw when no value is
 * currently available (as wallet-backed `client.payer`/`client.identity` do
 * while disconnected). Returns `null` in that case so the value is safe to
 * use directly from `useSyncExternalStore`.
 */
function readOptional<T>(read: () => T): NonNullable<T> | null {
    try {
        return read() ?? null;
    } catch {
        return null;
    }
}

/**
 * Returns the current fee payer (`client.payer`), or `null` when a
 * wallet-backed payer has no wallet connected.
 *
 * - Wallet-backed (`<WalletProvider role="signer" | "payer">`): reactive —
 *   subscribes via `client.subscribeToPayer` and returns the current wallet
 *   signer, or `null` while disconnected / for read-only wallets.
 * - Static (`<PayerProvider signer={…}>`): returns the provided signer.
 *
 * @throws If no ancestor provider installs `client.payer` (capability error).
 *
 * @example
 * ```tsx
 * const payer = usePayer();
 * if (!payer) return <ConnectButton />;
 * const tx = buildTransaction({ payer });
 * ```
 *
 * @see {@link useIdentity}
 * @see `useConnectedWallet` (from `@solana/kit-react-wallet`) — returns the
 *   wallet signer directly for flows where you want to gate rendering on the
 *   full wallet connection.
 */
export function usePayer(): TransactionSigner | null {
    const client = useClient<Partial<ClientWithPayer> & SubscribeToCapability<'payer'>>();
    const getSnapshot = () => readOptional(() => client.payer);

    // Subscribe via the `subscribeToPayer` convention so the hook re-renders
    // when a reactive payer plugin mutates `client.payer`. No-op for static
    // payers. `getSnapshot` is passed as `getServerSnapshot` too — the static
    // read works identically on server and client.
    const payer = useSyncExternalStore(client.subscribeToPayer ?? NOOP_SUBSCRIBE, getSnapshot, getSnapshot);

    if (!('payer' in client)) {
        throwMissingCapability(
            'usePayer',
            '`client.payer`',
            'Usually supplied by <WalletProvider> (with role "signer" or "payer") or <PayerProvider> — or any provider that installs a payer plugin.',
        );
    }

    return payer;
}

/**
 * Returns the current identity (`client.identity`), or `null` when a
 * wallet-backed identity has no wallet connected.
 *
 * - Wallet-backed (`<WalletProvider role="signer" | "identity">`): reactive —
 *   subscribes via `client.subscribeToIdentity` and returns the current
 *   wallet signer, or `null` while disconnected / for read-only wallets.
 * - Static (`<IdentityProvider signer={…}>`): returns the provided signer.
 *
 * @throws If no ancestor provider installs `client.identity` (capability
 *   error).
 *
 * @example
 * ```tsx
 * const identity = useIdentity();
 * if (!identity) return null;
 * const authority = identity.address;
 * ```
 *
 * @see {@link usePayer}
 */
export function useIdentity(): TransactionSigner | null {
    const client = useClient<Partial<ClientWithIdentity> & SubscribeToCapability<'identity'>>();
    const getSnapshot = () => readOptional(() => client.identity);

    const identity = useSyncExternalStore(client.subscribeToIdentity ?? NOOP_SUBSCRIBE, getSnapshot, getSnapshot);

    if (!('identity' in client)) {
        throwMissingCapability(
            'useIdentity',
            '`client.identity`',
            'Usually supplied by <WalletProvider> (with role "signer" or "identity") or <IdentityProvider> — or any provider that installs an identity plugin.',
        );
    }

    return identity;
}
