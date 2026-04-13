import type { MessageSigner, SignatureBytes, TransactionSigner } from '@solana/kit';
import type { SolanaChain } from '@solana/wallet-standard-chains';
import type { SolanaSignInInput, SolanaSignInOutput } from '@solana/wallet-standard-features';
import type { IdentifierString } from '@wallet-standard/base';
import type { UiWallet, UiWalletAccount } from '@wallet-standard/ui';

/**
 * The signer type for a connected wallet account.
 *
 * Always satisfies `TransactionSigner`. Additionally implements `MessageSigner`
 * when the wallet supports `solana:signMessage`.
 */
export type WalletSigner = TransactionSigner | (MessageSigner & TransactionSigner);

// -- Public types -----------------------------------------------------------

/**
 * The connection status of the wallet plugin.
 *
 * - `pending` — not yet initialized. Initial state on both server and browser.
 *   On the server this state is permanent. In the browser it resolves to
 *   `disconnected` or `reconnecting` once the storage check completes.
 * - `disconnected` — initialized, no wallet connected.
 * - `connecting` — a user-initiated connection request is in progress.
 * - `connected` — a wallet is connected.
 * - `disconnecting` — a user-initiated disconnection request is in progress.
 * - `reconnecting` — auto-connect in progress (connecting to persisted wallet).
 */
export type WalletStatus = 'connected' | 'connecting' | 'disconnected' | 'disconnecting' | 'pending' | 'reconnecting';

/**
 * A snapshot of the wallet plugin state at a point in time.
 *
 * Returned by {@link WalletNamespace.getState}. The same object reference
 * is returned on successive calls as long as nothing has changed — a new
 * object is only created when a field actually changes. This ensures
 * `useSyncExternalStore` only triggers re-renders on meaningful state changes.
 *
 * @see {@link WalletNamespace.getState}
 */
export type WalletState = {
    /**
     * The active connection, or `null` when disconnected.
     *
     * `signer` is `null` for read-only / watch-only wallets that do not
     * support any signing feature.
     */
    readonly connected: {
        readonly account: UiWalletAccount;
        /** The signer for the active account, or `null` for read-only wallets. */
        readonly signer: WalletSigner | null;
        readonly wallet: UiWallet;
    } | null;
    /** The current connection status. */
    readonly status: WalletStatus;
    /** All discovered wallets matching the configured chain and filter. */
    readonly wallets: readonly UiWallet[];
};

/**
 * A pluggable storage adapter for persisting the selected wallet account.
 *
 * Follows the Web Storage API shape (`getItem`/`setItem`/`removeItem`).
 * `localStorage` and `sessionStorage` satisfy this interface directly.
 * Async backends (IndexedDB, encrypted storage) may return `Promise`s.
 *
 * @example
 * ```ts
 * // Use sessionStorage
 * walletSigner({ chain: 'solana:mainnet', storage: sessionStorage });
 *
 * // Custom async adapter
 * walletSigner({
 *   chain: 'solana:mainnet',
 *   storage: {
 *     getItem: (key) => myStore.get(key),
 *     setItem: (key, value) => myStore.set(key, value),
 *     removeItem: (key) => myStore.delete(key),
 *   },
 * });
 * ```
 */
export type WalletStorage = {
    getItem(key: string): Promise<string | null> | string | null;
    removeItem(key: string): Promise<void> | void;
    setItem(key: string, value: string): Promise<void> | void;
};

/**
 * Configuration for the wallet plugins.
 *
 * @see {@link walletSigner}
 * @see {@link walletIdentity}
 * @see {@link walletPayer}
 * @see {@link walletWithoutSigner}
 */
export type WalletPluginConfig = {
    /**
     * Whether to attempt silent reconnection on startup using the persisted
     * wallet account from `storage`.
     *
     * Has no effect if `storage` is `null`.
     *
     * @default true
     */
    autoConnect?: boolean;

    /**
     * The chain this client targets (e.g. `'solana:mainnet'`).
     *
     * Accepts any {@link SolanaChain} (with literal autocomplete) and, as an
     * escape hatch, any wallet-standard {@link IdentifierString} shape
     * (`${string}:${string}`) for custom chains or non-Solana L2s. The plugin's
     * runtime behavior is chain-agnostic — it passes the identifier to
     * wallet-standard discovery (`uiWallet.chains.includes(chain)`) and to
     * `createSignerFromWalletAccount`. Wallets that don't advertise the chain
     * are filtered out, and accounts that can't produce a signer for the chain
     * resolve to `signer: null` (matching the read-only-wallet contract).
     *
     * One client = one chain. To switch networks, create a separate client
     * with a different chain and RPC endpoint.
     */
    chain: SolanaChain | (IdentifierString & {});

    /**
     * Optional filter function for wallet discovery. Called for each wallet
     * that supports the configured chain and `standard:connect`. Return `true`
     * to include the wallet, `false` to exclude it.
     *
     * @example
     * ```ts
     * // Require signAndSendTransaction
     * filter: (w) => w.features.includes('solana:signAndSendTransaction')
     *
     * // Whitelist specific wallets
     * filter: (w) => ['SomeWallet', 'SomeOtherWallet'].includes(w.name)
     * ```
     */
    filter?: (wallet: UiWallet) => boolean;

    /**
     * Storage adapter for persisting the selected wallet account across page
     * loads. Pass `null` to disable persistence entirely.
     *
     * When omitted in a browser environment, `localStorage` is used by default.
     * On the server, storage is always skipped regardless of this option.
     *
     * @default localStorage (in browser)
     * @see {@link WalletStorage}
     */
    storage?: WalletStorage | null;

    /**
     * Storage key used for persistence.
     *
     * @default 'kit-wallet'
     */
    storageKey?: string;
};

/**
 * The `wallet` namespace exposed on the client as `client.wallet`.
 *
 * All wallet state is accessed via {@link getState}. Use {@link subscribe}
 * to be notified of changes and integrate with framework primitives such as
 * React's `useSyncExternalStore`.
 *
 * @see {@link ClientWithWallet}
 */
export type WalletNamespace = {
    // -- Actions --

    /**
     * Connect to a wallet. Calls `standard:connect`, then selects the first
     * newly authorized account (or the first account if reconnecting). Creates
     * and caches a signer for the active account.
     *
     * @returns All accounts from the wallet after connection.
     * @throws The wallet's rejection error if the user declines the prompt.
     */
    connect: (wallet: UiWallet) => Promise<readonly UiWalletAccount[]>;

    /** Disconnect the active wallet. Calls `standard:disconnect` if supported. */
    disconnect: () => Promise<void>;

    // -- State --
    /**
     * Get the current wallet state. Referentially stable — a new object is
     * only created when a field actually changes, so React's
     * `useSyncExternalStore` skips re-renders when nothing meaningful changed.
     *
     * @see {@link WalletState}
     */
    getState: () => WalletState;

    /**
     * Switch to a different account within the connected wallet. Creates and
     * caches a new signer for the selected account.
     *
     * @throws `SolanaError(SOLANA_ERROR__WALLET__NOT_CONNECTED)` if no wallet is connected.
     */
    selectAccount: (account: UiWalletAccount) => void;

    /**
     * Sign In With Solana (SIWS-as-connect).
     *
     * Connects the wallet, calls `solana:signIn`, sets the returned account as
     * active, and creates a signer. After completion, the client is in the same
     * state as if {@link connect} had been called.
     *
     * All fields on `SolanaSignInInput` are optional — pass `{}` if no sign-in
     * customization is needed.
     *
     * To sign in with the already-connected wallet, pass
     * `getState().connected.wallet`.
     *
     * @throws `WalletStandardError(WALLET_STANDARD_ERROR__FEATURES__WALLET_ACCOUNT_FEATURE_UNIMPLEMENTED)`
     *   if the wallet does not support `solana:signIn`.
     */
    signIn: (wallet: UiWallet, input: SolanaSignInInput) => Promise<SolanaSignInOutput>;

    /**
     * Sign an arbitrary message with the connected account.
     *
     * Calls the wallet's `solana:signMessage` feature directly (does not go
     * through the cached signer), so message signing works even for wallets
     * that don't support transaction signing.
     *
     * @throws `SolanaError(SOLANA_ERROR__WALLET__NOT_CONNECTED)` if no wallet is connected.
     * @throws `WalletStandardError(WALLET_STANDARD_ERROR__FEATURES__WALLET_ACCOUNT_FEATURE_UNIMPLEMENTED)`
     *   if the wallet does not support `solana:signMessage`.
     */
    signMessage: (message: Uint8Array) => Promise<SignatureBytes>;

    /**
     * Subscribe to any wallet state change. Compatible with React's
     * `useSyncExternalStore` and similar framework primitives.
     *
     * @returns An unsubscribe function.
     *
     * @example
     * ```ts
     * const state = useSyncExternalStore(client.wallet.subscribe, client.wallet.getState);
     * ```
     */
    subscribe: (listener: () => void) => () => void;
};

/**
 * Properties added to the client by the wallet plugins.
 *
 * All wallet state and actions are namespaced under `client.wallet`.
 * Depending on which plugin variant is used, `client.payer` and/or
 * `client.identity` may also be set to the connected wallet's signer.
 *
 * @see {@link walletSigner}
 * @see {@link walletPayer}
 * @see {@link walletIdentity}
 * @see {@link walletWithoutSigner}
 * @see {@link WalletNamespace}
 *
 * @note this is not part of Kit plugin-interfaces, as it depends on wallet-standard types
 */
export type ClientWithWallet = {
    /** The wallet namespace — state, actions, and framework integration. */
    readonly wallet: WalletNamespace;
};
