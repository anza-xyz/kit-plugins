import type { SignatureBytes } from '@solana/kit';
import type { SolanaSignInInput, SolanaSignInOutput } from '@solana/wallet-standard-features';
import type { UiWallet, UiWalletAccount } from '@wallet-standard/ui';
/**
 * Returns a stable function that connects to a wallet.
 *
 * Wraps `client.wallet.connect`. The returned function is referentially
 * stable as long as the underlying client is stable, so it is safe to pass as
 * a dependency or prop without causing downstream re-renders.
 *
 * @returns A connect function. On success, resolves to the accounts that were
 *   authorized by the wallet.
 * @throws If no ancestor {@link WalletProvider} is mounted.
 *
 * @example
 * ```tsx
 * const connect = useConnectWallet();
 * const wallets = useWallets();
 * return <button onClick={() => connect(wallets[0])}>Connect</button>;
 * ```
 */
export declare function useConnectWallet(): (wallet: UiWallet) => Promise<readonly UiWalletAccount[]>;
/**
 * Returns a stable function that disconnects the active wallet.
 *
 * Wraps `client.wallet.disconnect`. No-ops if nothing is connected.
 *
 * @throws If no ancestor {@link WalletProvider} is mounted.
 */
export declare function useDisconnectWallet(): () => Promise<void>;
/**
 * Returns a stable function that selects a different account within the
 * connected wallet.
 *
 * Wraps `client.wallet.selectAccount`.
 *
 * @throws If no ancestor {@link WalletProvider} is mounted.
 * @throws (from the returned function) If no wallet is currently connected.
 */
export declare function useSelectAccount(): (account: UiWalletAccount) => void;
/**
 * Returns a stable function that signs an arbitrary message with the
 * connected wallet.
 *
 * Wraps `client.wallet.signMessage`. Works directly against the wallet's
 * `solana:signMessage` feature, so it also works for wallets that don't
 * support transaction signing.
 *
 * @throws If no ancestor {@link WalletProvider} is mounted.
 * @throws (from the returned function) If no wallet is connected, or the
 *   connected wallet does not support `solana:signMessage`.
 */
export declare function useSignMessage(): (message: Uint8Array) => Promise<SignatureBytes>;
/**
 * Returns a stable function that performs Sign In With Solana (SIWS-as-connect).
 *
 * Wraps `client.wallet.signIn`. Pass a specific wallet — the wallet will be
 * connected, asked to sign in, and the resulting account will be set as
 * active.
 *
 * @throws If no ancestor {@link WalletProvider} is mounted.
 * @throws (from the returned function) If the wallet does not support
 *   `solana:signIn`.
 *
 * @example
 * ```tsx
 * const signIn = useSignIn();
 * await signIn(wallet, { statement: 'Sign in to Example App' });
 * ```
 */
export declare function useSignIn(): (wallet: UiWallet, input?: SolanaSignInInput) => Promise<SolanaSignInOutput>;
//# sourceMappingURL=wallet-actions.d.ts.map