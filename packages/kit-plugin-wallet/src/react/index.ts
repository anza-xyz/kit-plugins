import type { ReadonlyUint8Array, SignatureBytes } from '@solana/kit';
import { type ActionResult, useAction, useClientCapability } from '@solana/react';
import type { SolanaSignInInput, SolanaSignInOutput } from '@solana/wallet-standard-features';
import type { UiWallet, UiWalletAccount } from '@wallet-standard/ui';
import type { ReactNode } from 'react';
import { useSyncExternalStore } from 'react';

import { isWalletWarmingUp } from '../status';
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
 * flips, not on every status change. Requires a `ClientProvider` whose client has a wallet plugin
 * installed; asserts this at mount with {@link useClientCapability}.
 *
 * @returns `true` once the warm-up has settled, otherwise `false`.
 *
 * @example
 * ```tsx
 * const isReady = useIsWalletReady();
 * return <button disabled={!isReady}>Connect</button>;
 * ```
 *
 * @see {@link WalletReadyGate}
 * @see {@link useWalletStatus}
 */
export function useIsWalletReady(): boolean {
    const wallet = useWalletNamespace('useIsWalletReady');
    const getIsReady = () => !isWalletWarmingUp(wallet.getState().status);
    return useSyncExternalStore(wallet.subscribe, getIsReady, getIsReady);
}

// -- Action hooks -----------------------------------------------------------

/**
 * Connects to a wallet from a React component.
 *
 * Wraps `client.wallet.connect` with {@link useAction}. Requires a `ClientProvider` whose client
 * has a wallet plugin installed; asserts this at mount with {@link useClientCapability}. An
 * in-flight connect is superseded when a newer one is dispatched.
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
 * Disconnects a wallet from a React component.
 *
 * Wraps `client.wallet.disconnect` with {@link useAction}. Requires a `ClientProvider` whose client
 * has a wallet plugin installed; asserts this at mount with {@link useClientCapability}.
 *
 * `dispatch`/`dispatchAsync` take an optional {@link UiWallet}. Called with no argument they
 * disconnect the active wallet; passing a non-active, currently authorized wallet deauthorizes that
 * wallet while leaving the active connection in place.
 *
 * @example
 * ```tsx
 * const { dispatch, isRunning } = useDisconnect();
 * // Disconnect the active wallet:
 * <button disabled={isRunning} onClick={() => dispatch()}>Disconnect</button>
 * // Or deauthorize a specific wallet:
 * <button disabled={isRunning} onClick={() => dispatch(wallet)}>Forget this wallet</button>
 * ```
 *
 * @see {@link useConnect}
 */
export function useDisconnect(): ActionResult<[wallet?: UiWallet], void> {
    const wallet = useWalletNamespace('useDisconnect');
    return useAction((abortSignal, uiWallet?: UiWallet) => wallet.disconnect(uiWallet, { abortSignal }));
}

/**
 * Signs in with a wallet (Sign In With Solana) from a React component.
 *
 * Wraps `client.wallet.signIn` with {@link useAction}. Requires a `ClientProvider` whose client has
 * a wallet plugin installed; asserts this at mount with {@link useClientCapability}. Like
 * {@link useConnect}, this establishes a full connection. An in-flight connect is superseded when a
 * newer one is dispatched.
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
 * client has a wallet plugin installed; asserts this at mount with {@link useClientCapability}.
 * A stale in-flight dispatch is dropped from the hook's state when a newer one starts (though
 * the wallet may still complete the older request in the background).
 *
 * `dispatch`/`dispatchAsync` take the message bytes and resolve with the signature. The bytes are
 * only read, never mutated, so a {@link ReadonlyUint8Array} (e.g. the output of a `@solana/kit`
 * codec) is accepted directly without a cast.
 *
 * @example
 * ```tsx
 * const { dispatch } = useSignMessage();
 * dispatch(new TextEncoder().encode('Hello'));
 * ```
 */
export function useSignMessage(): ActionResult<[message: ReadonlyUint8Array], SignatureBytes> {
    const wallet = useWalletNamespace('useSignMessage');
    return useAction((abortSignal, message: ReadonlyUint8Array) => wallet.signMessage(message, { abortSignal }));
}

/**
 * Returns a callback that selects a wallet account.
 *
 * Requires a `ClientProvider` whose client has a wallet plugin installed; asserts this at mount
 * with {@link useClientCapability}. Unlike the other action hooks, `selectAccount` is synchronous —
 * this hook returns the bound function directly rather than an `ActionResult`.
 *
 * The account may belong to any currently authorized wallet, not only the active one. Selecting an
 * account from a different authorized wallet switches the active connection to that wallet
 * synchronously (no prompt), leaving the previously active wallet authorized.
 *
 * @returns The `selectAccount` function — call it with a {@link UiWalletAccount} belonging to any
 *   currently authorized wallet. It throws if the account's handle can't be resolved to an
 *   authorized wallet (or isn't among that wallet's accounts), or that wallet is currently
 *   disconnecting.
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

// -- Components -------------------------------------------------------------

/**
 * Props for {@link WalletReadyGate}.
 */
export type WalletReadyGateProps = Readonly<{
    /** Rendered once the wallet client has finished its initial auto-reconnect warm-up. */
    children: ReactNode;
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
 * Requires a `ClientProvider` whose client has a wallet plugin installed; asserts this at mount with
 * {@link useClientCapability}.
 *
 * @example
 * ```tsx
 * <WalletReadyGate fallback={<Spinner />}>
 *     <WalletDependentApp />
 * </WalletReadyGate>
 * ```
 *
 * @see {@link useIsWalletReady}
 * @see {@link useWalletStatus}
 */
export function WalletReadyGate({ children, fallback }: WalletReadyGateProps): ReactNode {
    return useIsWalletReady() ? children : fallback;
}
