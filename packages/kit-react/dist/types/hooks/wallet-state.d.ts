import type { WalletSigner, WalletState, WalletStatus } from '@solana/kit-plugin-wallet';
import type { UiWallet, UiWalletAccount } from '@wallet-standard/ui';
/**
 * The active wallet connection, or `null` when disconnected.
 *
 * Narrowed projection of {@link WalletState.connected}.
 */
export type ConnectedWallet = {
    readonly account: UiWalletAccount;
    readonly signer: WalletSigner | null;
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
 * Returns the connected account, the signer for that account (or `null` for
 * read-only / watch-only wallets), and the wallet itself. Subscribes only to
 * the `connected` slice of wallet state.
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
 */
export declare function useConnectedWallet(): ConnectedWallet | null;
/**
 * The full wallet state: `wallets`, `connected`, and `status`.
 *
 * Convenience hook when a component genuinely needs all three. For
 * performance-sensitive components, prefer the focused hooks
 * ({@link useWallets}, {@link useConnectedWallet}, {@link useWalletStatus})
 * which re-render only when their slice changes.
 *
 * @throws If no ancestor {@link WalletProvider} is mounted.
 */
export declare function useWalletState(): WalletState;
//# sourceMappingURL=wallet-state.d.ts.map