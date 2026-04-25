import type { TransactionSigner } from '@solana/kit';
import { useSyncExternalStore } from 'react';

import { useClientCapability } from '../client-capability';

/**
 * Duck-type a reactive payer publisher. Plugins (e.g. wallet plugins) that
 * reassign `client.payer` over time install a sibling `subscribeToPayer`
 * so wallet-agnostic hooks can stay in sync without naming the producing
 * plugin. Structural-only; kept local so `kit-react` does not require a
 * runtime dep on any specific plugin.
 */
type ClientWithSubscribeToPayer = {
    readonly subscribeToPayer: (listener: () => void) => () => void;
};

/**
 * Duck-type a reactive identity publisher. See {@link ClientWithSubscribeToPayer}
 * for the rationale.
 */
type ClientWithSubscribeToIdentity = {
    readonly subscribeToIdentity: (listener: () => void) => () => void;
};

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
 * `subscribeToPayer` convention (wallet plugins do this). Static plugins
 * such as `payer()` or `signer()` from `@solana/kit-plugin-signer`
 * install a fixed signer; this hook simply returns it.
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
    const client = useClientCapability<Partial<ClientWithSubscribeToPayer> & { payer: TransactionSigner }>({
        capability: 'payer',
        hookName: 'usePayer',
        providerHint: 'Install `payer()`, `signer()`, or a wallet plugin (e.g. `walletSigner()`) on the client.',
    });
    const subscribe = client.subscribeToPayer ?? NOOP_SUBSCRIBE;
    const getSnapshot = () => readOptional(() => client.payer);
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Returns the current identity signer (`client.identity`), or `null` when
 * a reactive identity plugin is installed but no signer is currently
 * available (e.g. wallet not yet connected).
 *
 * Re-renders reactively when the installing plugin advertises the
 * `subscribeToIdentity` convention (wallet plugins do this). Static
 * plugins such as `identity()` or `signer()` from
 * `@solana/kit-plugin-signer` install a fixed signer; this hook simply
 * returns it.
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
    const client = useClientCapability<Partial<ClientWithSubscribeToIdentity> & { identity: TransactionSigner }>({
        capability: 'identity',
        hookName: 'useIdentity',
        providerHint: 'Install `identity()`, `signer()`, or a wallet plugin (e.g. `walletSigner()`) on the client.',
    });
    const subscribe = client.subscribeToIdentity ?? NOOP_SUBSCRIBE;
    const getSnapshot = () => readOptional(() => client.identity);
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
