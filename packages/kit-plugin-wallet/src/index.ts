import { extendClient, MessageSigner, SignatureBytes, TransactionSigner, withCleanup } from '@solana/kit';
import type { SolanaChain } from '@solana/wallet-standard-chains';
import type { SolanaSignInInput, SolanaSignInOutput } from '@solana/wallet-standard-features';
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
 * wallet({ chain: 'solana:mainnet', storage: sessionStorage });
 *
 * // Custom async adapter
 * wallet({
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
 * Configuration for the {@link wallet} and {@link walletAsPayer} plugins.
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
     * The Solana chain this client targets (e.g. `'solana:mainnet'`).
     *
     * One client = one chain. To switch networks, create a separate client
     * with a different chain and RPC endpoint.
     */
    chain: SolanaChain;

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
 * All wallet state is accessed via {@link getSnapshot}. Use {@link subscribe}
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
     * @throws {@link WalletNotConnectedError} if no wallet is connected.
     */
    selectAccount: (account: UiWalletAccount) => void;

    /**
     * Sign In With Solana.
     *
     * **Overload 1** — sign in with the already-connected wallet:
     * ```ts
     * const output = await client.wallet.signIn({ domain: window.location.host });
     * ```
     *
     * **Overload 2** — sign in with a specific wallet (SIWS-as-connect):
     * implicitly connects, sets the returned account as active, and creates a
     * signer, leaving the client in the same state as after `connect()`.
     * ```ts
     * const output = await client.wallet.signIn(uiWallet, { domain: window.location.host });
     * ```
     *
     * @throws {@link WalletNotConnectedError} (overload 1) if no wallet is connected.
     * @throws `WalletStandardError(WALLET_STANDARD_ERROR__FEATURES__WALLET_ACCOUNT_FEATURE_UNIMPLEMENTED)`
     *   if the wallet does not support `solana:signIn`.
     */
    signIn: {
        (input?: SolanaSignInInput): Promise<SolanaSignInOutput>;
        (wallet: UiWallet, input?: SolanaSignInInput): Promise<SolanaSignInOutput>;
    };

    /**
     * Sign an arbitrary message with the connected account.
     *
     * @throws {@link WalletNotConnectedError} if no wallet is connected or the
     *   wallet is read-only (no signer).
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
 * Properties added to the client by the {@link wallet} plugin.
 *
 * All wallet state and actions are namespaced under `client.wallet`.
 * `client.payer` is not affected — use the {@link walletAsPayer} plugin to
 * set the payer dynamically from the connected wallet.
 *
 * @see {@link wallet}
 * @see {@link WalletNamespace}
 */
// TODO: would be moved to kit plugin-interfaces
export type ClientWithWallet = {
    /** The wallet namespace — state, actions, and framework integration. */
    readonly wallet: WalletNamespace;
};

/**
 * Properties added to the client by the {@link walletAsPayer} plugin.
 *
 * Extends {@link ClientWithWallet} with a dynamic `payer` getter. When a
 * signing-capable wallet is connected, `client.payer` returns the wallet
 * signer. When disconnected or when the wallet is read-only, `client.payer`
 * is `undefined`.
 *
 * @see {@link walletAsPayer}
 * @see {@link ClientWithWallet}
 */
export type ClientWithWalletAsPayer = ClientWithWallet & {
    /** The connected wallet signer, or `undefined` when disconnected / read-only. */
    readonly payer: TransactionSigner | undefined;
};

// -- Error ------------------------------------------------------------------

/**
 * Thrown when a wallet operation is attempted but no wallet is connected
 * (or the connected wallet is read-only and has no signer).
 *
 * @example
 * ```ts
 * try {
 *   await client.wallet.signMessage(message);
 * } catch (e) {
 *   if (e instanceof WalletNotConnectedError) {
 *     console.error('Connect a wallet first');
 *   }
 * }
 * ```
 */
// TODO: we should probably add this error to Kit - it'd be useful for any similar wallet functionality
export class WalletNotConnectedError extends Error {
    /** The name of the operation that was attempted. */
    readonly operation: string;

    constructor(operation: string) {
        super(`Cannot ${operation}: no wallet connected`);
        this.name = 'WalletNotConnectedError';
        this.operation = operation;
    }
}

// -- Internal types ---------------------------------------------------------

type WalletStore = WalletNamespace & {
    [Symbol.dispose]: () => void;
};

// -- Store ------------------------------------------------------------------

function createWalletStore(_config: WalletPluginConfig): WalletStore {
    throw new Error('not implemented');
}

// -- Plugin -----------------------------------------------------------------

/**
 * A framework-agnostic Kit plugin that manages wallet discovery, connection
 * lifecycle, and signer creation using wallet-standard.
 *
 * Adds the `wallet` namespace to the client without touching `client.payer`.
 * Use this alongside the `payer()` plugin for backend signers, or when the
 * wallet's signer is used explicitly in instructions rather than as the
 * default payer. To set `client.payer` dynamically from the connected wallet,
 * use {@link walletAsPayer} instead.
 *
 * **SSR-safe.** Can be included in a shared client chain that runs on both
 * server and browser. On the server, status stays `'pending'`, actions throw
 * {@link WalletNotConnectedError}, and no registry listeners or storage reads
 * are made.
 *
 * ```ts
 * const client = createEmptyClient()
 *   .use(rpc('https://api.mainnet-beta.solana.com'))
 *   .use(payer(backendKeypair))
 *   .use(wallet({ chain: 'solana:mainnet' }))
 *   .use(planAndSendTransactions());
 *
 * // client.payer is always backendKeypair (wallet plugin does not touch it)
 * // client.wallet.getState().connected?.signer for manual use
 * ```
 *
 * @param config - Plugin configuration.
 *
 * @example
 * ```ts
 * import { createEmptyClient } from '@solana/kit';
 * import { rpc } from '@solana/kit-plugin-rpc';
 * import { wallet } from '@solana/kit-plugin-wallet';
 *
 * const client = createEmptyClient()
 *   .use(rpc('https://api.mainnet-beta.solana.com'))
 *   .use(wallet({ chain: 'solana:mainnet' }));
 *
 * // Connect a wallet
 * await client.wallet.connect(uiWallet);
 *
 * // Subscribe to state changes (React)
 * const state = useSyncExternalStore(client.wallet.subscribe, client.wallet.getState);
 * ```
 *
 * @see {@link walletAsPayer}
 * @see {@link WalletPluginConfig}
 * @see {@link ClientWithWallet}
 */
export function wallet(config: WalletPluginConfig) {
    return <T extends object>(client: T): ClientWithWallet & Disposable & Omit<T, 'wallet'> => {
        const store = createWalletStore(config);

        return withCleanup(
            extendClient(client, {
                wallet: store,
            }),
            () => store[Symbol.dispose](),
        ) as ClientWithWallet & Disposable & Omit<T, 'wallet'>;
    };
}

/**
 * A framework-agnostic Kit plugin that manages wallet discovery, connection
 * lifecycle, and signer creation using wallet-standard — and syncs the
 * connected wallet's signer to `client.payer` via a dynamic getter.
 *
 * When a signing-capable wallet is connected, `client.payer` returns the
 * wallet signer. When disconnected or when the wallet is read-only,
 * `client.payer` is `undefined`. Use the base {@link wallet} plugin instead
 * if you need `client.payer` to be controlled by a separate `payer()` plugin.
 *
 * **SSR-safe.** Can be included in a shared client chain that runs on both
 * server and browser. On the server, status stays `'pending'`, `client.payer`
 * is `undefined`, and no registry listeners or storage reads are made.
 *
 * ```ts
 * const client = createEmptyClient()
 *   .use(rpc('https://api.mainnet-beta.solana.com'))
 *   .use(walletAsPayer({ chain: 'solana:mainnet' }))
 *   .use(planAndSendTransactions());
 *
 * // Server: status === 'pending', client.payer === undefined
 * // Browser: auto-connect fires, client.payer becomes the wallet signer
 * ```
 *
 * @param config - Plugin configuration.
 *
 * @example
 * ```ts
 * import { createEmptyClient } from '@solana/kit';
 * import { rpc } from '@solana/kit-plugin-rpc';
 * import { walletAsPayer } from '@solana/kit-plugin-wallet';
 *
 * const client = createEmptyClient()
 *   .use(rpc('https://api.mainnet-beta.solana.com'))
 *   .use(walletAsPayer({ chain: 'solana:mainnet' }));
 *
 * // Connect a wallet
 * await client.wallet.connect(uiWallet);
 * // client.payer now returns the wallet signer
 * ```
 *
 * @see {@link wallet}
 * @see {@link WalletPluginConfig}
 * @see {@link ClientWithWalletAsPayer}
 */
export function walletAsPayer(config: WalletPluginConfig) {
    return <T extends object>(client: T): ClientWithWalletAsPayer & Disposable & Omit<T, 'payer' | 'wallet'> => {
        const store = createWalletStore(config);

        const obj = withCleanup(
            extendClient(client, {
                wallet: store,
            }),
            () => store[Symbol.dispose](),
        );

        Object.defineProperty(obj, 'payer', {
            configurable: true,
            enumerable: true,
            get() {
                return obj.wallet.getState().connected?.signer ?? undefined;
            },
        });

        return obj as unknown as ClientWithWalletAsPayer & Disposable & Omit<T, 'payer' | 'wallet'>;
    };
}
