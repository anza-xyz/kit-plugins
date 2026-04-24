import type { TransactionSigner } from '@solana/kit';
import type { ClientWithSubscribeToIdentity, ClientWithSubscribeToPayer } from '@solana/kit-plugin-signer';
import { useSyncExternalStore } from 'react';

import { useClient } from '../client-context';
import { throwMissingCapability } from '../errors';

const NOOP_SUBSCRIBE: (listener: () => void) => () => void = () => () => {};

/**
 * Coerces a throwing getter into a nullable read. Wallet-backed
 * `client.payer` / `client.identity` getters throw when no wallet is
 * connected; `useSyncExternalStore` propagates snapshot exceptions by
 * unmounting the subtree, so the hook cannot read the getter directly.
 *
 * @internal
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
 * reactive payer plugin is installed but no signer is currently
 * available (e.g. wallet not yet connected).
 *
 * Re-renders reactively when the installing plugin advertises the
 * `subscribeToPayer` convention. Static plugins like
 * {@link PayerProvider} / {@link SignerProvider} install a fixed signer;
 * this hook simply returns it.
 *
 * @return The current `TransactionSigner` on `client.payer`, or `null`
 *         when unavailable.
 * @throws An `Error` if no payer plugin is installed at all (no `payer`
 *         key on the client). That's a mount-time configuration bug, not
 *         a runtime state.
 *
 * @example
 * ```tsx
 * const payer = usePayer();
 * if (!payer) return <ConnectWalletPrompt />;
 * return <Address address={payer.address} />;
 * ```
 *
 * @see {@link useIdentity}
 */
export function usePayer(): TransactionSigner | null {
    const client = useClient<Partial<ClientWithSubscribeToPayer & { payer: TransactionSigner }>>();
    const subscribe = client.subscribeToPayer ?? NOOP_SUBSCRIBE;
    const getSnapshot = () => readOptional(() => client.payer);
    const payer = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    if (!('payer' in client)) {
        throwMissingCapability(
            'usePayer',
            '`client.payer`',
            'Mount a <PayerProvider>, <SignerProvider>, or a wallet provider that installs a payer.',
        );
    }
    return payer;
}

/**
 * Returns the current identity signer (`client.identity`), or `null` when
 * a reactive identity plugin is installed but no signer is currently
 * available (e.g. wallet not yet connected).
 *
 * Re-renders reactively when the installing plugin advertises the
 * `subscribeToIdentity` convention. Static plugins like
 * {@link IdentityProvider} / {@link SignerProvider} install a fixed
 * signer; this hook simply returns it.
 *
 * @return The current `TransactionSigner` on `client.identity`, or `null`
 *         when unavailable.
 * @throws An `Error` if no identity plugin is installed at all (no
 *         `identity` key on the client). That's a mount-time configuration
 *         bug, not a runtime state.
 *
 * @example
 * ```tsx
 * const identity = useIdentity();
 * if (!identity) return <ConnectWalletPrompt />;
 * return <Address address={identity.address} />;
 * ```
 *
 * @see {@link usePayer}
 */
export function useIdentity(): TransactionSigner | null {
    const client = useClient<Partial<ClientWithSubscribeToIdentity & { identity: TransactionSigner }>>();
    const subscribe = client.subscribeToIdentity ?? NOOP_SUBSCRIBE;
    const getSnapshot = () => readOptional(() => client.identity);
    const identity = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    if (!('identity' in client)) {
        throwMissingCapability(
            'useIdentity',
            '`client.identity`',
            'Mount an <IdentityProvider>, <SignerProvider>, or a wallet provider that installs an identity.',
        );
    }
    return identity;
}
