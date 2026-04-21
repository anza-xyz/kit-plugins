import type { SignatureBytes } from '@solana/kit';
import type { SolanaSignInInput, SolanaSignInOutput } from '@solana/wallet-standard-features';
import type { UiWallet, UiWalletAccount } from '@wallet-standard/ui';
import { useCallback } from 'react';

import { type ActionState, useAction } from '../../hooks/use-action';
import { useWalletClient } from '../internal/wallet-client';

/**
 * Reactive state and controls for connecting a wallet.
 *
 * Same shape as other `useAction`-based hooks ({@link useSendTransaction},
 * {@link useSignMessage}, …) — the common case is fire-and-forget
 * (`send(wallet)`; render from `isRunning` / `error`), and flows that
 * `await send(...)` for the resolved accounts should filter supersedes
 * with `isAbortError`.
 *
 * Calling `send` again while a previous connect is in flight aborts the
 * prior call — good default for double-click-on-Connect situations.
 *
 * @throws If no ancestor {@link WalletProvider} is mounted.
 *
 * @example
 * ```tsx
 * const { send: connect, isRunning, error } = useConnectWallet();
 * const wallets = useWallets();
 *
 * return (
 *     <>
 *         {wallets.map(w => (
 *             <button key={w.name} onClick={() => connect(w)} disabled={isRunning}>
 *                 {isRunning ? 'Connecting…' : `Connect ${w.name}`}
 *             </button>
 *         ))}
 *         {error && <span>{String(error)}</span>}
 *     </>
 * );
 * ```
 */
export function useConnectWallet(): ActionState<[wallet: UiWallet], readonly UiWalletAccount[]> {
    const client = useWalletClient('useConnectWallet');
    const fn = useCallback((_signal: AbortSignal, wallet: UiWallet) => client.wallet.connect(wallet), [client]);
    return useAction(fn);
}

/**
 * Reactive state and controls for disconnecting the active wallet. No-ops
 * if nothing is connected.
 *
 * Same shape as {@link useConnectWallet}. The reactive state is most useful
 * when a wallet has a slow disconnect flow (e.g. closing a remote session);
 * typical UIs can fire-and-forget.
 *
 * @throws If no ancestor {@link WalletProvider} is mounted.
 */
export function useDisconnectWallet(): ActionState<[], void> {
    const client = useWalletClient('useDisconnectWallet');
    const fn = useCallback((_signal: AbortSignal) => client.wallet.disconnect(), [client]);
    return useAction(fn);
}

/**
 * Returns a stable function that selects a different account within the
 * connected wallet.
 *
 * Wraps `client.wallet.selectAccount`. **Synchronous by design** — selecting
 * between already-authorized accounts is a local state switch, not a
 * round-trip to the wallet (that's what {@link useConnectWallet} is for,
 * and it's the wallet that decides which accounts to authorize). Returns
 * `void` rather than `Promise<void>` to make that contract visible in the
 * type; the call takes effect synchronously and the next render reads the
 * new account from {@link useConnectedWallet}. Kept as a bare callback
 * rather than an `ActionState` for the same reason — there's no async
 * lifecycle to track.
 *
 * @throws If no ancestor {@link WalletProvider} is mounted.
 * @throws (from the returned function) If no wallet is currently connected.
 */
export function useSelectAccount(): (account: UiWalletAccount) => void {
    const client = useWalletClient('useSelectAccount');
    return useCallback((account: UiWalletAccount) => client.wallet.selectAccount(account), [client]);
}

/**
 * Reactive state and controls for signing an arbitrary message with the
 * connected wallet.
 *
 * Wraps `client.wallet.signMessage`. Works directly against the wallet's
 * `solana:signMessage` feature, so it also works for wallets that don't
 * support transaction signing. Same `ActionState` shape as
 * {@link useConnectWallet}.
 *
 * @throws If no ancestor {@link WalletProvider} is mounted.
 * @throws (from `send`) If no wallet is connected, or the connected wallet
 *   does not support `solana:signMessage`.
 *
 * @example
 * ```tsx
 * const { send: signMessage, isRunning, data: signature, error } = useSignMessage();
 *
 * return (
 *     <button onClick={() => signMessage(encodeText('Hello'))} disabled={isRunning}>
 *         {isRunning ? 'Waiting for wallet…' : 'Sign'}
 *     </button>
 * );
 * ```
 */
export function useSignMessage(): ActionState<[message: Uint8Array], SignatureBytes> {
    const client = useWalletClient('useSignMessage');
    const fn = useCallback((_signal: AbortSignal, message: Uint8Array) => client.wallet.signMessage(message), [client]);
    return useAction(fn);
}

/**
 * Reactive state and controls for Sign In With Solana (SIWS-as-connect).
 *
 * Wraps `client.wallet.signIn`. Pass a specific wallet — the wallet will be
 * connected, asked to sign in, and the resulting account will be set as
 * active. Same `ActionState` shape as {@link useConnectWallet}.
 *
 * @throws If no ancestor {@link WalletProvider} is mounted.
 * @throws (from `send`) If the wallet does not support `solana:signIn`.
 *
 * @example
 * ```tsx
 * const { send: signIn, isRunning, error } = useSignIn();
 * await signIn(wallet, { statement: 'Sign in to Example App' });
 * ```
 */
export function useSignIn(): ActionState<[wallet: UiWallet, input?: SolanaSignInInput], SolanaSignInOutput> {
    const client = useWalletClient('useSignIn');
    const fn = useCallback(
        (_signal: AbortSignal, wallet: UiWallet, input: SolanaSignInInput = {}) => client.wallet.signIn(wallet, input),
        [client],
    );
    return useAction(fn);
}
