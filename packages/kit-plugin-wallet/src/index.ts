import { ClientWithPayer, extendClient, MessageSigner, SignatureBytes, TransactionSigner } from '@solana/kit';
import type { SolanaChain } from '@solana/wallet-standard-chains';
import type { SolanaSignInInput, SolanaSignInOutput } from '@solana/wallet-standard-features';
import type { UiWallet, UiWalletAccount } from '@wallet-standard/ui';

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
 * The active wallet connection — the wallet, the selected account, and the
 * account's signer (or `null` for read-only / watch-only wallets that do not
 * support any signing feature).
 *
 * Available as `client.wallet.connected` when a wallet is connected.
 *
 * @see {@link WalletNamespace.connected}
 */
export type WalletConnection = {
    /** The currently selected account within the connected wallet. */
    readonly account: UiWalletAccount;
    /**
     * The signer for the active account, or `null` for read-only wallets.
     *
     * Satisfies `TransactionSigner` when non-null. May additionally implement
     * `MessageSigner` if the wallet supports `solana:signMessage`.
     */
    readonly signer: TransactionSigner | (MessageSigner & TransactionSigner) | null;
    /** The connected wallet. */
    readonly wallet: UiWallet;
};

/**
 * A snapshot of the wallet plugin state at a point in time.
 *
 * Referentially stable when unchanged — suitable for use with
 * `useSyncExternalStore` and similar framework primitives.
 *
 * The `connected` field uses `hasSigner` rather than the signer object itself
 * to avoid unnecessary re-renders when the signer reference changes. The
 * actual signer is accessible via {@link WalletConnection.signer}.
 *
 * @see {@link WalletNamespace.getSnapshot}
 */
export type WalletStateSnapshot = {
    /**
     * The active connection, or `null` when disconnected.
     *
     * `hasSigner` is `false` for read-only / watch-only wallets.
     */
    readonly connected: {
        readonly account: UiWalletAccount;
        /** Whether the connected account has a signer. */
        readonly hasSigner: boolean;
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
 * Configuration for the {@link wallet} plugin.
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

    /**
     * Whether to sync the connected wallet's signer to `client.payer`.
     *
     * When `true` (default), a dynamic `payer` getter is defined on the client.
     * When no wallet is connected the getter returns whatever `client.payer` was
     * before the wallet plugin was installed (the fallback payer), or `undefined`
     * if no prior payer was configured.
     *
     * @default true
     */
    usePayer?: boolean;
};

/**
 * The `wallet` namespace exposed on the client as `client.wallet`.
 *
 * Contains all wallet state, actions, and framework integration helpers.
 * Framework adapters (React, Vue, Svelte, etc.) should bind to
 * `subscribe` and `getSnapshot` rather than individual getters.
 *
 * @see {@link WalletApi}
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

    /**
     * The active connection — wallet, account, and signer — or `null` when
     * disconnected. For rendering, prefer reading from {@link getSnapshot}
     * to avoid tearing.
     */
    readonly connected: WalletConnection | null;

    /** Disconnect the active wallet. Calls `standard:disconnect` if supported. */
    disconnect: () => Promise<void>;

    /**
     * Get a referentially stable snapshot of the full wallet state.
     * The same object reference is returned on subsequent calls as long as
     * nothing has changed.
     *
     * @see {@link WalletStateSnapshot}
     */
    getSnapshot: () => WalletStateSnapshot;

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

    /** Current connection status. */
    readonly status: WalletStatus;

    // -- Framework integration --

    /**
     * Subscribe to any wallet state change. Compatible with React's
     * `useSyncExternalStore` and similar framework primitives.
     *
     * @returns An unsubscribe function.
     *
     * @example
     * ```ts
     * // React
     * const state = useSyncExternalStore(client.wallet.subscribe, client.wallet.getSnapshot);
     * ```
     */
    subscribe: (listener: () => void) => () => void;

    // -- State (getters) --
    /** All discovered wallets matching the configured chain and filter. */
    readonly wallets: readonly UiWallet[];
};

/**
 * Properties added to the client by the {@link wallet} plugin.
 *
 * All wallet state and actions are namespaced under `client.wallet`.
 * `client.payer` remains at the top level and dynamically resolves to the
 * connected wallet's signer (with fallback to any previously configured payer).
 *
 * @see {@link wallet}
 * @see {@link WalletNamespace}
 */
// TODO: would be moved to kit plugin-interfaces
export type ClientWithWallet = {
    /** The wallet namespace — state, actions, and framework integration. */
    readonly wallet: WalletNamespace;
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

type WalletStoreState = {
    account: UiWalletAccount | null;
    connectedWallet: UiWallet | null;
    signer: TransactionSigner | (MessageSigner & TransactionSigner) | null;
    status: WalletStatus;
    wallets: readonly UiWallet[];
};

type WalletStore = {
    connect: (wallet: UiWallet) => Promise<readonly UiWalletAccount[]>;
    [Symbol.dispose]: () => void;
    disconnect: () => Promise<void>;
    getConnected: () => WalletConnection | null;
    getSnapshot: () => WalletStateSnapshot;
    getState: () => WalletStoreState;
    selectAccount: (account: UiWalletAccount) => void;
    signIn: {
        (input?: SolanaSignInInput): Promise<SolanaSignInOutput>;
        (wallet: UiWallet, input?: SolanaSignInInput): Promise<SolanaSignInOutput>;
    };
    signMessage: (message: Uint8Array) => Promise<SignatureBytes>;
    subscribe: (listener: () => void) => () => void;
};

// -- Store ------------------------------------------------------------------

function createWalletStore(_config: WalletPluginConfig): WalletStore {
    throw new Error('not implemented');
}

// -- Plugin -----------------------------------------------------------------

type WalletPluginReturn<T extends object> = ClientWithWallet &
    Disposable &
    Omit<T, 'payer' | 'wallet'> &
    Partial<ClientWithPayer>;

/**
 * A framework-agnostic Kit plugin that manages wallet discovery, connection
 * lifecycle, and signer creation using wallet-standard.
 *
 * When connected, the plugin syncs the wallet signer to `client.payer` via a
 * dynamic getter, falling back to any previously configured payer when
 * disconnected. All wallet state and actions are namespaced under
 * `client.wallet`. The plugin exposes subscribable state for framework adapters
 * (React, Vue, Svelte, Solid, etc.) to consume.
 *
 * **SSR-safe.** The plugin can be included in a shared client chain that runs
 * on both server and browser. On the server, status stays `'pending'`, actions
 * throw {@link WalletNotConnectedError}, and no registry listeners or storage
 * reads are made. The same client chain works everywhere:
 *
 * ```ts
 * const client = createEmptyClient()
 *   .use(rpc('https://api.mainnet-beta.solana.com'))
 *   .use(payer(backendKeypair))
 *   .use(wallet({ chain: 'solana:mainnet' }));
 *
 * // Server: client.wallet.status === 'pending', client.payer === backendKeypair
 * // Browser: auto-connect fires, client.payer becomes the wallet signer
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
 * const [firstAccount] = await client.wallet.connect(uiWallet);
 *
 * // Subscribe to state changes (React)
 * const state = useSyncExternalStore(client.wallet.subscribe, client.wallet.getSnapshot);
 * ```
 *
 * @see {@link WalletPluginConfig}
 * @see {@link WalletApi}
 */
export function wallet(config: WalletPluginConfig) {
    return <T extends object>(client: T): WalletPluginReturn<T> => {
        const store = createWalletStore(config);

        const fallbackClient = 'payer' in client ? (client as T & { payer: TransactionSigner }) : null;

        const walletObj: Omit<WalletNamespace, 'connected' | 'status' | 'wallets'> = {
            connect: (w: UiWallet) => store.connect(w),
            disconnect: () => store.disconnect(),
            getSnapshot: () => store.getSnapshot(),
            selectAccount: (a: UiWalletAccount) => store.selectAccount(a),
            signIn: store.signIn,
            signMessage: (msg: Uint8Array) => store.signMessage(msg),
            subscribe: (l: () => void) => store.subscribe(l),
        };

        // Define getters for the rest of the state properties
        for (const [key, fn] of Object.entries({
            connected: () => store.getConnected(),
            status: () => store.getState().status,
            wallets: () => store.getState().wallets,
        } as Record<string, () => unknown>)) {
            Object.defineProperty(walletObj, key, { configurable: true, enumerable: true, get: fn });
        }

        const obj = extendClient(client, {
            wallet: walletObj as WalletNamespace,
            // TODO: This will use withCleanup after the next Kit release
            [Symbol.dispose]: () => store[Symbol.dispose](),
        });

        if (config.usePayer !== false) {
            Object.defineProperty(obj, 'payer', {
                configurable: true,
                enumerable: true,
                get() {
                    // Note that we only read `client.payer` here, to allow the fallback to be defined with a get function
                    return store.getState().signer ?? fallbackClient?.payer;
                },
            });
        }

        return obj as WalletPluginReturn<T>;
    };
}
