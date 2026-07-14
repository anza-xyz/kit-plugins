import type { ReadonlyUint8Array, SignatureBytes } from '@solana/kit';
import { type ActionResult, useAction } from '@solana/react';
import type { SolanaSignInInput, SolanaSignInOutput } from '@solana/wallet-standard-features';
import type { UiWallet, UiWalletAccount } from '@wallet-standard/ui';
import type { ReactNode } from 'react';
import { useSyncExternalStore } from 'react';

import { isWalletWarmingUp } from '../status';
import type { ClientWithWallet, WalletNamespace, WalletState, WalletStatus } from '../types';

// -- State hooks ------------------------------------------------------------

/**
 * Subscribes to the wallet connection status from a React component.
 *
 * Wraps `client.wallet.subscribe` / `getState` with `useSyncExternalStore`, re-rendering only when
 * the status changes.
 *
 * @param client - A client with a wallet plugin installed (e.g. `walletSigner()`).
 * @returns The current {@link WalletStatus} (`'pending'` on the server and in React Native).
 *
 * @example
 * ```tsx
 * const status = useWalletStatus(client);
 * if (status === 'pending') return null; // avoid flashing UI before auto-reconnect resolves
 * ```
 *
 * @see {@link useConnectedWallet}
 * @see {@link useWallets}
 */
export function useWalletStatus(client: ClientWithWallet): WalletStatus {
    const { wallet } = client;
    const getStatus = () => wallet.getState().status;
    return useSyncExternalStore(wallet.subscribe, getStatus, getStatus);
}

/**
 * Subscribes to the active wallet connection from a React component.
 *
 * Wraps `client.wallet.subscribe` / `getState` with `useSyncExternalStore`, re-rendering only when
 * the connection changes (connect, disconnect, or account switch).
 *
 * @param client - A client with a wallet plugin installed (e.g. `walletSigner()`).
 * @returns The active connection — `{ account, signer, wallet }` — or `null` when disconnected.
 *   `signer` is `null` for read-only wallets.
 *
 * @example
 * ```tsx
 * const connected = useConnectedWallet(client);
 * return connected ? <p>{connected.account.address}</p> : <p>Not connected</p>;
 * ```
 *
 * @see {@link useWalletStatus}
 * @see {@link useWallets}
 */
export function useConnectedWallet(client: ClientWithWallet): WalletState['connected'] {
    const { wallet } = client;
    const getConnected = () => wallet.getState().connected;
    return useSyncExternalStore(wallet.subscribe, getConnected, getConnected);
}

/**
 * Subscribes to the list of discovered wallets from a React component.
 *
 * Wraps `client.wallet.subscribe` / `getState` with `useSyncExternalStore`, re-rendering only when
 * the discovered-wallet list changes.
 *
 * @param client - A client with a wallet plugin installed (e.g. `walletSigner()`).
 * @returns All discovered wallets matching the client's configured chain and filter (empty on the
 *   server and in React Native).
 *
 * @example
 * ```tsx
 * const wallets = useWallets(client);
 * const connect = useConnect(client);
 * return wallets.map(w => <button key={w.name} onClick={() => connect.dispatch(w)}>{w.name}</button>);
 * ```
 *
 * @see {@link useWalletStatus}
 * @see {@link useConnectedWallet}
 */
export function useWallets(client: ClientWithWallet): readonly UiWallet[] {
    const { wallet } = client;
    const getWallets = () => wallet.getState().wallets;
    return useSyncExternalStore(wallet.subscribe, getWallets, getWallets);
}

/**
 * Reports whether the wallet client has finished its initial auto-reconnect "warm-up".
 *
 * Returns `false` while the status is `'pending'` or `'reconnecting'` — the transient states a
 * freshly built client passes through while it silently re-establishes a persisted connection — and
 * `true` once it settles into any stable state (`'connected'`, `'disconnected'`, or a user-initiated
 * `'connecting'` / `'disconnecting'`). This is the declarative, render-time counterpart to the
 * store's imperative `whenReady()`, gating on the exact same set of statuses.
 *
 * Use it to hold back wallet-dependent UI until the connection has settled, so a persisted wallet
 * never flashes "disconnected" before it reconnects. Re-renders only when this readiness boolean
 * flips, not on every status change.
 *
 * @param client - A client with a wallet plugin installed (e.g. `walletSigner()`).
 * @returns `true` once the warm-up has settled, otherwise `false`.
 *
 * @example
 * ```tsx
 * const isReady = useIsWalletReady(client);
 * return <button disabled={!isReady}>Connect</button>;
 * ```
 *
 * @see {@link WalletReadyGate}
 * @see {@link useWalletStatus}
 */
export function useIsWalletReady(client: ClientWithWallet): boolean {
    const { wallet } = client;
    const getIsReady = () => !isWalletWarmingUp(wallet.getState().status);
    return useSyncExternalStore(wallet.subscribe, getIsReady, getIsReady);
}

// -- Action hooks -----------------------------------------------------------

/**
 * Connects to a wallet from a React component.
 *
 * Wraps `client.wallet.connect` with {@link useAction}. An in-flight connect is superseded when a
 * newer one is dispatched.
 *
 * `dispatch`/`dispatchAsync` take the {@link UiWallet} to connect to and resolve with the wallet's
 * accounts once connected.
 *
 * @param client - A client with a wallet plugin installed (e.g. `walletSigner()`).
 *
 * @example
 * ```tsx
 * const { dispatch, isRunning } = useConnect(client);
 * <button disabled={isRunning} onClick={() => dispatch(wallet)}>Connect</button>
 * ```
 *
 * @see {@link useDisconnect}
 * @see {@link useSignIn}
 */
export function useConnect(client: ClientWithWallet): ActionResult<[wallet: UiWallet], readonly UiWalletAccount[]> {
    const { wallet } = client;
    return useAction((abortSignal, uiWallet: UiWallet) => wallet.connect(uiWallet, { abortSignal }));
}

/**
 * Disconnects a wallet from a React component.
 *
 * Wraps `client.wallet.disconnect` with {@link useAction}.
 *
 * `dispatch`/`dispatchAsync` take an optional {@link UiWallet}. Called with no argument they
 * disconnect the active wallet; passing a non-active, currently authorized wallet deauthorizes that
 * wallet while leaving the active connection in place.
 *
 * @param client - A client with a wallet plugin installed (e.g. `walletSigner()`).
 *
 * @example
 * ```tsx
 * const { dispatch, isRunning } = useDisconnect(client);
 * // Disconnect the active wallet:
 * <button disabled={isRunning} onClick={() => dispatch()}>Disconnect</button>
 * // Or deauthorize a specific wallet:
 * <button disabled={isRunning} onClick={() => dispatch(wallet)}>Forget this wallet</button>
 * ```
 *
 * @see {@link useConnect}
 */
export function useDisconnect(client: ClientWithWallet): ActionResult<[wallet?: UiWallet], void> {
    const { wallet } = client;
    return useAction((abortSignal, uiWallet?: UiWallet) => wallet.disconnect(uiWallet, { abortSignal }));
}

/**
 * Signs in with a wallet (Sign In With Solana) from a React component.
 *
 * Wraps `client.wallet.signIn` with {@link useAction}. Like {@link useConnect}, this establishes a
 * full connection. An in-flight connect is superseded when a newer one is dispatched.
 *
 * `dispatch`/`dispatchAsync` take the {@link UiWallet} and a `SolanaSignInInput` (pass `{}` for no
 * customization) and resolve with the wallet's sign-in output.
 *
 * @param client - A client with a wallet plugin installed (e.g. `walletSigner()`).
 *
 * @example
 * ```tsx
 * const { dispatch } = useSignIn(client);
 * dispatch(wallet, { domain: window.location.host });
 * ```
 *
 * @see {@link useConnect}
 */
export function useSignIn(
    client: ClientWithWallet,
): ActionResult<[wallet: UiWallet, input: SolanaSignInInput], SolanaSignInOutput> {
    const { wallet } = client;
    return useAction((abortSignal, uiWallet: UiWallet, input: SolanaSignInInput) =>
        wallet.signIn(uiWallet, input, { abortSignal }),
    );
}

/**
 * Signs an arbitrary message with the connected account from a React component.
 *
 * Wraps `client.wallet.signMessage` with {@link useAction}. A stale in-flight dispatch is dropped
 * from the hook's state when a newer one starts (though the wallet may still complete the older
 * request in the background).
 *
 * `dispatch`/`dispatchAsync` take the message bytes and resolve with the signature. The bytes are
 * only read, never mutated, so a {@link ReadonlyUint8Array} (e.g. the output of a `@solana/kit`
 * codec) is accepted directly without a cast.
 *
 * @param client - A client with a wallet plugin installed (e.g. `walletSigner()`).
 *
 * @example
 * ```tsx
 * const { dispatch } = useSignMessage(client);
 * dispatch(new TextEncoder().encode('Hello'));
 * ```
 */
export function useSignMessage(client: ClientWithWallet): ActionResult<[message: ReadonlyUint8Array], SignatureBytes> {
    const { wallet } = client;
    return useAction((abortSignal, message: ReadonlyUint8Array) => wallet.signMessage(message, { abortSignal }));
}

/**
 * Returns a callback that selects a wallet account.
 *
 * Unlike the other action hooks, `selectAccount` is synchronous — this hook returns the bound
 * function directly rather than an `ActionResult`.
 *
 * The account may belong to any currently authorized wallet, not only the active one. Selecting an
 * account from a different authorized wallet switches the active connection to that wallet
 * synchronously (no prompt), leaving the previously active wallet authorized.
 *
 * @param client - A client with a wallet plugin installed (e.g. `walletSigner()`).
 * @returns The `selectAccount` function — call it with a {@link UiWalletAccount} belonging to any
 *   currently authorized wallet. It throws if the account's handle can't be resolved to an
 *   authorized wallet (or isn't among that wallet's accounts), or that wallet is currently
 *   disconnecting.
 *
 * @example
 * ```tsx
 * const selectAccount = useSelectAccount(client);
 * <button onClick={() => selectAccount(account)}>Use this account</button>
 * ```
 *
 * @see {@link useConnectedWallet}
 */
export function useSelectAccount(client: ClientWithWallet): WalletNamespace['selectAccount'] {
    return client.wallet.selectAccount;
}

// -- Components -------------------------------------------------------------

/**
 * Props for {@link WalletReadyGate}.
 */
export type WalletReadyGateProps = Readonly<{
    /** Rendered once the wallet client has finished its initial auto-reconnect warm-up. */
    children: ReactNode;
    /** A client with a wallet plugin installed (e.g. `walletSigner()`). */
    client: ClientWithWallet;
    /** Rendered while the client is still warming up (`'pending'` / `'reconnecting'`). */
    fallback: ReactNode;
}>;

/**
 * Renders `fallback` while the wallet client is still in its initial auto-reconnect warm-up
 * (`'pending'` / `'reconnecting'`), then reveals `children` once the connection has settled.
 *
 * A declarative wrapper over {@link useIsWalletReady} for the common case of holding back a whole
 * wallet-dependent subtree. Its props are shaped like React's `<Suspense fallback>`, but it is
 * synchronous — it renders `fallback` directly off the reactive status rather than suspending, so it
 * needs no `<Suspense>` ancestor. It lets an app paint its chrome immediately while gating only the
 * wallet-dependent UI, so a persisted wallet never flashes "disconnected" before it silently
 * reconnects. For finer control (disabling a button, showing an inline spinner) read the boolean from
 * {@link useIsWalletReady} directly. To actually suspend a subtree instead, throw the Suspense-safe
 * {@link WalletNamespace.whenReady} promise from your own component.
 *
 * @example
 * ```tsx
 * <WalletReadyGate client={client} fallback={<Spinner />}>
 *     <WalletDependentApp />
 * </WalletReadyGate>
 * ```
 *
 * @see {@link useIsWalletReady}
 * @see {@link useWalletStatus}
 */
export function WalletReadyGate({ children, client, fallback }: WalletReadyGateProps): ReactNode {
    return useIsWalletReady(client) ? children : fallback;
}
