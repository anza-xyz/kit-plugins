import type { SignatureBytes } from '@solana/kit';
import { type ActionResult, useAction, useClientCapability } from '@solana/react';
import type { SolanaSignInInput, SolanaSignInOutput } from '@solana/wallet-standard-features';
import type { UiWallet, UiWalletAccount } from '@wallet-standard/ui';
import { useSyncExternalStore } from 'react';

import type { ClientWithWallet, WalletNamespace, WalletState, WalletStatus } from '../types';

/**
 * Reads the wallet namespace from the nearest `ClientProvider`, asserting at mount that a wallet
 * plugin is installed. Shared by every hook in this module so the capability check, error hook
 * name, and provider hint stay in one place.
 */
function useWalletNamespace(hookName: string): WalletNamespace {
    return useClientCapability<ClientWithWallet>({
        capability: 'wallet',
        hookName,
        providerHint: 'Install a wallet plugin on the client, e.g. `walletSigner()`.',
    }).wallet;
}

// -- State hooks ------------------------------------------------------------

/**
 * Subscribes to the wallet connection status from a React component.
 *
 * Wraps `client.wallet.subscribe` / `getState` with `useSyncExternalStore`, re-rendering only when
 * the status changes. Requires a `ClientProvider` whose client has a wallet plugin installed;
 * asserts this at mount with {@link useClientCapability}.
 *
 * @returns The current {@link WalletStatus} (`'pending'` on the server and in React Native).
 *
 * @example
 * ```tsx
 * const status = useWalletStatus();
 * if (status === 'pending') return null; // avoid flashing UI before auto-reconnect resolves
 * ```
 *
 * @see {@link useConnectedWallet}
 * @see {@link useWallets}
 */
export function useWalletStatus(): WalletStatus {
    const wallet = useWalletNamespace('useWalletStatus');
    const getStatus = () => wallet.getState().status;
    return useSyncExternalStore(wallet.subscribe, getStatus, getStatus);
}

/**
 * Subscribes to the active wallet connection from a React component.
 *
 * Wraps `client.wallet.subscribe` / `getState` with `useSyncExternalStore`, re-rendering only when
 * the connection changes (connect, disconnect, or account switch). Requires a `ClientProvider`
 * whose client has a wallet plugin installed; asserts this at mount with {@link useClientCapability}.
 *
 * @returns The active connection — `{ account, signer, wallet }` — or `null` when disconnected.
 *   `signer` is `null` for read-only wallets.
 *
 * @example
 * ```tsx
 * const connected = useConnectedWallet();
 * return connected ? <p>{connected.account.address}</p> : <p>Not connected</p>;
 * ```
 *
 * @see {@link useWalletStatus}
 * @see {@link useWallets}
 */
export function useConnectedWallet(): WalletState['connected'] {
    const wallet = useWalletNamespace('useConnectedWallet');
    const getConnected = () => wallet.getState().connected;
    return useSyncExternalStore(wallet.subscribe, getConnected, getConnected);
}

/**
 * Subscribes to the list of discovered wallets from a React component.
 *
 * Wraps `client.wallet.subscribe` / `getState` with `useSyncExternalStore`, re-rendering only when
 * the discovered-wallet list changes. Requires a `ClientProvider` whose client has a wallet plugin
 * installed; asserts this at mount with {@link useClientCapability}.
 *
 * @returns All discovered wallets matching the client's configured chain and filter (empty on the
 *   server and in React Native).
 *
 * @example
 * ```tsx
 * const wallets = useWallets();
 * const connect = useConnect();
 * return wallets.map(w => <button key={w.name} onClick={() => connect.dispatch(w)}>{w.name}</button>);
 * ```
 *
 * @see {@link useWalletStatus}
 * @see {@link useConnectedWallet}
 */
export function useWallets(): readonly UiWallet[] {
    const wallet = useWalletNamespace('useWallets');
    const getWallets = () => wallet.getState().wallets;
    return useSyncExternalStore(wallet.subscribe, getWallets, getWallets);
}

// -- Action hooks -----------------------------------------------------------

/**
 * Connects to a wallet from a React component.
 *
 * Wraps `client.wallet.connect` with {@link useAction}. Requires a `ClientProvider` whose client
 * has a wallet plugin installed; asserts this at mount with {@link useClientCapability}. The hook
 * owns the `AbortSignal`, so an in-flight connect is aborted when a newer one is dispatched.
 *
 * `dispatch`/`dispatchAsync` take the {@link UiWallet} to connect to and resolve with the wallet's
 * accounts once connected.
 *
 * @example
 * ```tsx
 * const { dispatch, isRunning } = useConnect();
 * <button disabled={isRunning} onClick={() => dispatch(wallet)}>Connect</button>
 * ```
 *
 * @see {@link useDisconnect}
 * @see {@link useSignIn}
 */
export function useConnect(): ActionResult<[wallet: UiWallet], readonly UiWalletAccount[]> {
    const wallet = useWalletNamespace('useConnect');
    return useAction((abortSignal, uiWallet: UiWallet) => wallet.connect(uiWallet, { abortSignal }));
}

/**
 * Disconnects the active wallet from a React component.
 *
 * Wraps `client.wallet.disconnect` with {@link useAction}. Requires a `ClientProvider` whose client
 * has a wallet plugin installed; asserts this at mount with {@link useClientCapability}.
 *
 * `dispatch`/`dispatchAsync` take no arguments.
 *
 * @example
 * ```tsx
 * const { dispatch, isRunning } = useDisconnect();
 * <button disabled={isRunning} onClick={() => dispatch()}>Disconnect</button>
 * ```
 *
 * @see {@link useConnect}
 */
export function useDisconnect(): ActionResult<[], void> {
    const wallet = useWalletNamespace('useDisconnect');
    return useAction(abortSignal => wallet.disconnect({ abortSignal }));
}

/**
 * Signs in with a wallet (Sign In With Solana) from a React component.
 *
 * Wraps `client.wallet.signIn` with {@link useAction}. Requires a `ClientProvider` whose client has
 * a wallet plugin installed; asserts this at mount with {@link useClientCapability}. Like
 * {@link useConnect}, this establishes a full connection; the hook owns the `AbortSignal`, so an
 * in-flight sign-in is aborted when a newer one is dispatched.
 *
 * `dispatch`/`dispatchAsync` take the {@link UiWallet} and a `SolanaSignInInput` (pass `{}` for no
 * customization) and resolve with the wallet's sign-in output.
 *
 * @example
 * ```tsx
 * const { dispatch } = useSignIn();
 * dispatch(wallet, { domain: window.location.host });
 * ```
 *
 * @see {@link useConnect}
 */
export function useSignIn(): ActionResult<[wallet: UiWallet, input: SolanaSignInInput], SolanaSignInOutput> {
    const wallet = useWalletNamespace('useSignIn');
    return useAction((abortSignal, uiWallet: UiWallet, input: SolanaSignInInput) =>
        wallet.signIn(uiWallet, input, { abortSignal }),
    );
}

/**
 * Signs an arbitrary message with the connected account from a React component.
 *
 * Wraps `client.wallet.signMessage` with {@link useAction}. Requires a `ClientProvider` whose
 * client has a wallet plugin installed; asserts this at mount with {@link useClientCapability}. The
 * hook owns the `AbortSignal`, so an in-flight signature request is aborted when a newer one is
 * dispatched.
 *
 * `dispatch`/`dispatchAsync` take the message bytes and resolve with the signature.
 *
 * @example
 * ```tsx
 * const { dispatch } = useSignMessage();
 * dispatch(new TextEncoder().encode('Hello'));
 * ```
 */
export function useSignMessage(): ActionResult<[message: Uint8Array], SignatureBytes> {
    const wallet = useWalletNamespace('useSignMessage');
    return useAction((abortSignal, message: Uint8Array) => wallet.signMessage(message, { abortSignal }));
}

/**
 * Returns a callback that switches to a different account within the connected wallet.
 *
 * Requires a `ClientProvider` whose client has a wallet plugin installed; asserts this at mount
 * with {@link useClientCapability}. Unlike the other action hooks, `selectAccount` is synchronous —
 * this hook returns the bound function directly rather than an `ActionResult`. The returned
 * reference is stable across renders.
 *
 * @returns The `selectAccount` function — call it with a {@link UiWalletAccount} belonging to the
 *   connected wallet. It throws if no wallet is connected or the account is not available.
 *
 * @example
 * ```tsx
 * const selectAccount = useSelectAccount();
 * <button onClick={() => selectAccount(account)}>Use this account</button>
 * ```
 *
 * @see {@link useConnectedWallet}
 */
export function useSelectAccount(): WalletNamespace['selectAccount'] {
    return useWalletNamespace('useSelectAccount').selectAccount;
}
