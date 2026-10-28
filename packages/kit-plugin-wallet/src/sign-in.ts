import { SolanaSignIn, type SolanaSignInFeature } from '@solana/wallet-standard-features';
import type { UiWallet } from '@wallet-standard/ui';
import { getWalletFeature } from '@wallet-standard/ui-features';

import { isOffchainSignInVersion } from './harden';

/**
 * Reports whether a wallet can sign in with an offchain message, i.e. whether
 * it accepts the `useOffchainMessage` option of `solana:signIn`.
 *
 * Offchain sign-in wraps the Sign In With Solana text in a version 1 Solana
 * offchain message, which hardware wallets can display and sign. Wallets
 * advertise support with version `1.1.0` or a later `1.x` version of the
 * `solana:signIn` feature; {@link WalletNamespace.signIn} rejects `useOffchainMessage` for a
 * wallet without it, before the wallet is called.
 *
 * @param wallet - A wallet from `client.wallet.getState().wallets`.
 * @returns `true` if the wallet supports `solana:signIn` with
 *   `useOffchainMessage`, otherwise `false`. Never throws: a wallet whose
 *   feature can't be read is reported as unsupported.
 *
 * @example
 * ```ts
 * const output = await client.wallet.signIn(wallet, {
 *     domain: 'example.com',
 *     ...(supportsSignInWithOffchainMessage(wallet) && { useOffchainMessage: { messageVersion: 1 } }),
 * });
 * ```
 *
 * @see {@link WalletNamespace.signIn}
 */
export function supportsSignInWithOffchainMessage(wallet: UiWallet): boolean {
    if (!wallet.features.includes(SolanaSignIn)) return false;
    try {
        const { version } = getWalletFeature(wallet, SolanaSignIn) as SolanaSignInFeature[typeof SolanaSignIn];
        return isOffchainSignInVersion(version);
    } catch {
        // The wallet's live features no longer include `solana:signIn` (or the
        // feature is malformed), or the handle isn't registered. Apps call this
        // while rendering, so report no support rather than throwing.
        return false;
    }
}
