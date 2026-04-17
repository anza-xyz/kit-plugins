import type { WalletSigner, WalletState, WalletStatus } from '@solana/kit-plugin-wallet';
import type { UiWallet, UiWalletAccount } from '@wallet-standard/ui';
/**
 * The active wallet connection, or `null` when disconnected.
 *
 * Narrowed projection of {@link WalletState.connected} covering just the
 * wallet and account identity. Use {@link useWalletSigner} to access the
 * associated signer — a connected wallet may still be read-only
 * (`signer === null`), so the two concerns are split into separate hooks.
 */
export type ConnectedWallet = {
    readonly account: UiWalletAccount;
    readonly wallet: UiWallet;
};
/**
 * All discovered wallets for the configured chain.
 *
 * Subscribes to wallet-standard discovery events and re-renders only when the
 * discovered set changes. Use this to build a wallet-picker UI.
 *
 * @throws If no ancestor {@link WalletProvider} is mounted.
 *
 * @example
 * ```tsx
 * const wallets = useWallets();
 * return wallets.map((w) => <button key={w.name} onClick={() => connect(w)}>{w.name}</button>);
 * ```
 *
 * @see {@link useConnectedWallet}
 * @see {@link useWalletStatus}
 */
export declare function useWallets(): readonly UiWallet[];
/**
 * The current wallet connection status.
 *
 * Subscribes to connection state changes and re-renders only when the status
 * string changes. Use for conditional UI (e.g. showing a connect button vs
 * an account dropdown).
 *
 * @throws If no ancestor {@link WalletProvider} is mounted.
 */
export declare function useWalletStatus(): WalletStatus;
/**
 * The active wallet connection, or `null` when disconnected.
 *
 * Returns only the wallet and account — the signer lives behind
 * {@link useWalletSigner} because a connected wallet may still be read-only
 * (no signer) and conflating the two encourages unchecked
 * `connected.signer.signTransactions(...)` bugs.
 *
 * The projection is memoized so that signer-only changes on the underlying
 * store (e.g. the wallet recreating its signer after a `change` event) do
 * not re-render consumers of this hook. Account / wallet identity is what
 * matters here.
 *
 * @throws If no ancestor {@link WalletProvider} is mounted.
 *
 * @example
 * ```tsx
 * const connected = useConnectedWallet();
 * if (connected === null) return <button onClick={…}>Connect</button>;
 * return <span>{connected.account.address}</span>;
 * ```
 *
 * @see {@link useWallets}
 * @see {@link useWalletStatus}
 * @see {@link useWalletSigner}
 */
export declare function useConnectedWallet(): ConnectedWallet | null;
/**
 * The connected wallet's signer, or `null` when no wallet is connected or
 * the active account cannot sign (read-only / watch-only wallets, or a
 * wallet that doesn't support the configured chain).
 *
 * Separate from {@link useConnectedWallet} so that the null-case is visible
 * in the type: `connected !== null` does not imply `signer !== null`.
 *
 * @throws If no ancestor {@link WalletProvider} is mounted.
 *
 * @example
 * ```tsx
 * const signer = useWalletSigner();
 * if (!signer) return <span>Connect a signing wallet to continue.</span>;
 * const [signed] = await signer.signTransactions([tx]);
 * ```
 *
 * @see {@link useConnectedWallet}
 * @see `usePayer` / `useIdentity` (from `@solana/kit-react`) — the logical
 *   payer / identity signers, which may or may not come from the wallet
 *   depending on the provider stack.
 */
export declare function useWalletSigner(): WalletSigner | null;
/**
 * The full wallet state: `wallets`, `connected`, and `status`.
 *
 * Convenience hook when a component genuinely needs all three. For
 * performance-sensitive components, prefer the focused hooks
 * ({@link useWallets}, {@link useConnectedWallet}, {@link useWalletSigner},
 * {@link useWalletStatus}) which re-render only when their slice changes.
 *
 * @throws If no ancestor {@link WalletProvider} is mounted.
 */
export declare function useWalletState(): WalletState;
//# sourceMappingURL=wallet-state.d.ts.map