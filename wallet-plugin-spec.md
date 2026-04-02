# RFC: `wallet` Plugin for Kit

**Status:** Draft
**Package:** `@solana/kit-plugin-wallet`

## Prerequisites

This spec builds on two changes that must land first:

- **Plugin lifecycle utilities** (`extendClient`, `withCleanup`) in `@solana/plugin-core` — `extendClient` provides descriptor-preserving client extension (preserves getters and symbols through plugin composition). `withCleanup` provides `Symbol.dispose`-based cleanup chaining. `addUse` is updated to use `Object.defineProperties` instead of spread to preserve property descriptors. See the plugin lifecycle RFC.
- **Bridge function** (`createSignerFromWalletAccount`) in `@solana/wallet-account-signer` — a framework-agnostic function that takes a `UiWalletAccount` and a `SolanaChain` and returns a `TransactionSendingSigner` or `TransactionModifyingSigner` (and optionally `MessageSigner`). Extracted from the logic currently in `@solana/react`'s `useWalletAccountTransactionSigner` / `useWalletAccountTransactionSendingSigner` hooks.

### Dependencies

```json
{
    "peerDependencies": {
        "@solana/kit": "^6.x"
    },
    "dependencies": {
        "@solana/wallet-account-signer": "^1.x",
        "@wallet-standard/app": "^1.x",
        "@wallet-standard/ui": "^1.x",
        "@wallet-standard/ui-features": "^1.x",
        "@wallet-standard/ui-registry": "^1.x"
    }
}
```

The bridge function (`createSignerFromWalletAccount`) is consumed via `@solana/wallet-account-signer`. `extendClient` and `withCleanup` are consumed via `@solana/kit`.

## Summary

A framework-agnostic Kit plugin that manages wallet discovery, connection lifecycle, and signer creation using wallet-standard. When a wallet is connected, the plugin optionally syncs its signer to the client's `payer` slot via a dynamic getter, falling back to any previously configured payer when no wallet is connected. The plugin exposes subscribable wallet state for framework adapters (React, Vue, Svelte, etc.) to consume without coupling to any specific UI framework.

**SSR-safe.** Both `wallet` and `walletAsPayer` can be included in the same client chain on both server and browser. On the server (`typeof window === 'undefined'`), the plugin gracefully degrades — status stays `'pending'`, wallet list is empty, payer is `undefined` (when using `walletAsPayer`), storage is skipped, no registry listeners are created. On the browser it initializes fully. This means a single client chain works everywhere:

```typescript
import { walletAsPayer } from '@solana/kit-plugin-wallet';

const client = createEmptyClient()
    .use(rpc('https://api.mainnet-beta.solana.com'))
    .use(walletAsPayer({ chain: 'solana:mainnet' }))
    .use(systemProgram())
    .use(planAndSendTransactions());

// Server: status === 'pending', client.payer === undefined
// Browser: auto-connect fires, client.payer becomes wallet signer
```

## Motivation

Kit provides a composable plugin system for building Solana clients. The existing `payer` plugin works well for static signers (backend keypairs, generated signers), but frontend dApps need wallet integration — discovery, user-initiated connection, account switching, and reactive state for UI rendering.

Today, `@solana/react` bridges wallet-standard wallets into Kit signers via React hooks (`useWalletAccountTransactionSigner`, etc.), but this logic is locked inside React. There is no framework-agnostic layer that manages wallet state and provides Kit-compatible signers.

This plugin fills that gap. It sits between wallet-standard's raw discovery API and framework-specific hooks, providing:

- Automatic wallet discovery via `getWallets()`
- Connection lifecycle management (connect, disconnect, silent reconnect)
- Signer creation and caching via the bridge function
- Dynamic payer integration (via `walletAsPayer`)
- A subscribable store that any framework can bind to
- Cleanup via `withCleanup` and `Symbol.dispose`

### Where it fits

```
+---------------------------------------------------+
|  React hooks / Vue composables / Svelte stores    |  <- Framework adapters (thin)
|  Subscribe to client wallet state for rendering   |
+---------------------------------------------------+
|  wallet() plugin                                  |  <- THIS SPEC
|  Discovery, connection, signer, payer, state      |
+---------------------------------------------------+
|  Kit plugin client                                |
|  .use(rpc(...))                                   |
|  .use(wallet({ ... }))  <- or .use(payer(...))   |
|  .use(planAndSendTransactions())                  |
+---------------------------------------------------+
|  createSignerFromWalletAccount()                  |  <- @solana/wallet-account-signer
+---------------------------------------------------+
|  extendClient / withCleanup                       |  <- Plugin lifecycle (in plugin-core)
+---------------------------------------------------+
|  wallet-standard       @solana/signers       Kit  |
+---------------------------------------------------+
```

### Relationship to `@solana/react`

This plugin extracts the wallet management logic currently embedded in `@solana/react`'s `SelectedWalletAccountContextProvider` (persistence, auto-restore, account selection, signer creation) into a framework-agnostic layer. Once this plugin ships, `@solana/react` can be rewritten as a thin adapter over `client.wallet.subscribe` / `client.wallet.getSnapshot` — a handful of hooks rather than a full wallet management implementation. The same approach applies to Vue, Svelte, and Solid adapters, all consuming the same plugin.

### Relationship to `payer`

The package exports two plugin functions that differ in how they interact with `client.payer`:

**`wallet()`** — adds the `wallet` namespace but does not touch `client.payer`. Use alongside the `payer()` plugin for backend signers, or when the wallet's signer is used explicitly in instructions rather than as the default payer.

**`walletAsPayer()`** — adds the `wallet` namespace and overrides `client.payer` with a dynamic getter. When connected with a signing-capable account, `client.payer` returns the wallet signer. When disconnected or read-only, `client.payer` is `undefined`.

```typescript
import { walletAsPayer } from '@solana/kit-plugin-wallet';
import { planAndSendTransactions } from '@solana/kit-plugin-instruction-plan';

const client = createEmptyClient()
    .use(rpc('https://api.mainnet-beta.solana.com'))
    .use(walletAsPayer({ chain: 'solana:mainnet' }))
    .use(planAndSendTransactions());

// No wallet connected -> client.payer is undefined
// Wallet connected    -> client.payer returns wallet signer
// Wallet disconnects  -> client.payer is undefined
```

`walletAsPayer` uses `Object.defineProperty` for the dynamic `payer` getter. `addUse` preserves this getter descriptor through subsequent `.use()` calls, and downstream plugins that use `extendClient` also preserve it.

Downstream plugins (e.g. `planAndSendTransactions()`) depend only on `client.payer` being a `TransactionSigner`. They do not know or care whether it was set by `payer()` or `walletAsPayer()`.

## API Surface

### Plugin creation

```typescript
import { wallet, walletAsPayer } from '@solana/kit-plugin-wallet';

// Wallet as payer — most dApps
const client = createEmptyClient()
    .use(rpc('https://api.mainnet-beta.solana.com'))
    .use(walletAsPayer({ chain: 'solana:mainnet' }))
    .use(planAndSendTransactions());
// client.payer is TransactionSigner | undefined

// Wallet alongside a static payer
const client = createEmptyClient()
    .use(rpc('https://api.mainnet-beta.solana.com'))
    .use(payer(backendKeypair))
    .use(wallet({ chain: 'solana:mainnet' }))
    .use(planAndSendTransactions());
// client.payer is TransactionSigner (from payer plugin, untouched)
// client.wallet.getSnapshot().connected?.signer for manual use
```

### Client type extension

Both `wallet` and `walletAsPayer` add the `wallet` namespace to the client. `walletAsPayer` additionally overrides `client.payer`:

```typescript
type ClientWithWallet = {
    wallet: {
        // -- State --

        /**
         * Subscribe to any wallet state change. Compatible with React's
         * useSyncExternalStore and similar framework primitives.
         * Returns an unsubscribe function.
         */
        subscribe: (listener: () => void) => () => void;

        /**
         * Get a snapshot of the full wallet state. Referentially stable
         * when unchanged — a new object is only created when a
         * snapshot-relevant field actually changes.
         */
        getSnapshot: () => WalletStateSnapshot;

        // -- Actions --

        /**
         * Connect to a wallet. Calls standard:connect on the wallet, then
         * selects the first newly authorized account (or the first account
         * if reconnecting). Creates and caches a signer for the active account.
         * Returns all accounts from the wallet after connection.
         */
        connect: (wallet: UiWallet) => Promise<readonly UiWalletAccount[]>;

        /** Disconnect the active wallet. Calls standard:disconnect if supported. */
        disconnect: () => Promise<void>;

        /**
         * Switch to a different account within the connected wallet.
         * Creates and caches a new signer for the selected account.
         */
        selectAccount: (account: UiWalletAccount) => void;

        /**
         * Sign an arbitrary message with the connected account.
         * Throws if no account is connected or if the wallet does not
         * support the solana:signMessage feature.
         * Delegates to the MessageSigner returned by the bridge function.
         */
        signMessage: (message: Uint8Array) => Promise<SignatureBytes>;

        /**
         * Sign In With Solana.
         *
         * Overload 1: sign in with the already-connected wallet.
         * Throws if no wallet is connected or if the wallet does not
         * support the solana:signIn feature.
         *
         * Overload 2: sign in with a specific wallet (SIWS-as-connect).
         * Implicitly connects the wallet, sets the returned account as
         * active, creates and caches a signer. After completion, the
         * client is in the same state as if connect() had been called.
         */
        signIn(input?: SolanaSignInInput): Promise<SolanaSignInOutput>;
        signIn(wallet: UiWallet, input?: SolanaSignInInput): Promise<SolanaSignInOutput>;
    };
};

/**
 * Extends ClientWithWallet with a dynamic payer getter.
 * client.payer returns the wallet signer when connected,
 * or undefined when disconnected / read-only.
 */
type ClientWithWalletAsPayer = ClientWithWallet & {
    readonly payer: TransactionSigner | undefined;
};

export function wallet(config: WalletPluginConfig): <T extends object>(client: T) => T & ClientWithWallet;

export function walletAsPayer(config: WalletPluginConfig): <T extends object>(client: T) => T & ClientWithWalletAsPayer;

type WalletStatus =
    | 'pending' // not yet initialized (SSR, or browser before first storage/registry check)
    | 'disconnected' // initialized, no wallet connected
    | 'connecting' // user-initiated connection in progress
    | 'connected' // wallet connected, account + signer active
    | 'disconnecting' // user-initiated disconnection in progress
    | 'reconnecting'; // auto-connect in progress (restoring previous session)

type WalletStateSnapshot = {
    wallets: readonly UiWallet[];
    connected: {
        wallet: UiWallet;
        account: UiWalletAccount;
        /** The signer for the active account, or null for read-only wallets. */
        signer: TransactionSigner | (MessageSigner & TransactionSigner) | null;
    } | null;
    status: WalletStatus;
};
```

All wallet state is accessed via `getSnapshot()`. The snapshot is a frozen object, memoized — a new reference is only created when a field actually changes (checked via reference equality in `setState`). This ensures `useSyncExternalStore` only triggers re-renders when something meaningful changed.

```tsx
const { connected, status, wallets } = useSyncExternalStore(client.wallet.subscribe, client.wallet.getSnapshot);

if (status === 'pending') return null;
if (!connected) return <ConnectButton wallets={wallets} />;
if (!connected.signer) return <ReadOnlyBadge account={connected.account} />;

// Use signer in event handlers
const handleSend = () => {
    buildTransaction({ authority: connected.signer, payer: client.payer });
};
return <SendButton onClick={handleSend} />;
```

### Dynamic payer (via `walletAsPayer`)

`walletAsPayer` defines a `payer` getter via `Object.defineProperty`. The getter returns the current wallet signer, or `undefined` when disconnected or when the wallet is read-only.

`wallet` does not touch `client.payer`.

### Cleanup

The plugin registers cleanup via `withCleanup`, spread into the return object:

```typescript
// Explicit cleanup
client[Symbol.dispose]();

// With using syntax (TypeScript 5.2+)
{
    using client = createEmptyClient()
        .use(rpc('https://...'))
        .use(wallet({ chain: 'solana:mainnet' }))
        .use(planAndSendTransactions());
} // cleanup runs automatically

// In React
useEffect(() => {
    const client = createEmptyClient()
        .use(rpc('https://...'))
        .use(wallet({ chain: 'solana:mainnet' }));
    setClient(client);
    return () => client[Symbol.dispose]();
}, []);
```

Cleanup unsubscribes from wallet-standard registry events, any active wallet's `standard:events` listener, and the auto-reconnect registry watcher (if still pending). Multiple disposable plugins chain in LIFO order.

## Implementation

### Plugin function

```typescript
import { extendClient, withCleanup } from '@solana/kit';
import { createSignerFromWalletAccount } from '@solana/wallet-account-signer';
import {
    SolanaError,
    SOLANA_ERROR__WALLET__NOT_CONNECTED,
    SOLANA_ERROR__WALLET__FEATURE_NOT_SUPPORTED,
} from '@solana/errors';
import { getWallets } from '@wallet-standard/app';
import { getOrCreateUiWalletForStandardWallet_DO_NOT_USE_OR_YOU_WILL_BE_FIRED } from '@wallet-standard/ui-registry';
import { getWalletFeature } from '@wallet-standard/ui-features';

import type { UiWallet, UiWalletAccount } from '@wallet-standard/ui';
import type { TransactionSigner, MessageSigner, SolanaChain } from '@solana/kit';

export function wallet(config: WalletPluginConfig) {
    return <T extends object>(client: T) => {
        const store = createWalletStore(config);

        return extendClient(client, {
            wallet: buildWalletNamespace(store),
            ...withCleanup(client, () => store.destroy()),
        });
    };
}

export function walletAsPayer(config: WalletPluginConfig) {
    return <T extends object>(client: T) => {
        const store = createWalletStore(config);

        const obj = extendClient(client, {
            wallet: buildWalletNamespace(store),
            ...withCleanup(client, () => store.destroy()),
        });

        Object.defineProperty(obj, 'payer', {
            get() {
                return store.getState().signer;
            },
            enumerable: true,
            configurable: true,
        });

        return obj;
    };
}

function buildWalletNamespace(store: WalletStore) {
    return {
        subscribe: (l: () => void) => store.subscribe(l),
        getSnapshot: () => store.getSnapshot(),
        connect: (w: UiWallet) => store.connect(w),
        disconnect: () => store.disconnect(),
        selectAccount: (a: UiWalletAccount) => store.selectAccount(a),
        signMessage: (msg: Uint8Array) => store.signMessage(msg),
        signIn: (...args: [SolanaSignInInput?] | [UiWallet, SolanaSignInInput?]) => store.signIn(...args),
    };
}
```

### Internal store

The store is a plain object with state management -- no external dependencies. It follows the same subscribe/getSnapshot contract as React's `useSyncExternalStore`.

#### State shape

```typescript
type WalletStoreState = {
    wallets: readonly UiWallet[];
    connectedWallet: UiWallet | null;
    account: UiWalletAccount | null;
    /**
     * Cached signer derived from the active account via
     * createSignerFromWalletAccount(). May include MessageSigner
     * if the wallet supports solana:signMessage.
     */
    signer: TransactionSigner | (MessageSigner & TransactionSigner) | null;
    status: WalletStatus;
};
```

#### Store implementation

```typescript
function createWalletStore(config: WalletPluginConfig) {
    const isBrowser = typeof window !== 'undefined';

    let state: WalletStoreState = {
        wallets: [],
        connectedWallet: null,
        account: null,
        signer: null,
        status: 'pending',
    };

    let snapshot: WalletStateSnapshot = deriveSnapshot(state);
    const listeners = new Set<() => void>();
    let walletEventsCleanup: (() => void) | null = null;
    let reconnectCleanup: (() => void) | null = null;

    // Tracks whether the user has made an explicit selection (connect or selectAccount).
    // When true, auto-restore from storage will not override the user's choice.
    let userHasSelected = false;

    // Resolve storage: skip on server, default to localStorage in browser.
    const storage = !isBrowser ? null : config.storage === null ? null : (config.storage ?? localStorage);
    const storageKey = config.storageKey ?? 'kit-wallet';

    // -- State management --

    function setState(updates: Partial<WalletStoreState>) {
        const prev = state;
        state = { ...state, ...updates };

        // Only create a new snapshot if snapshot-relevant fields changed.
        // This ensures referential stability for useSyncExternalStore —
        // React's Object.is comparison sees the same reference and skips
        // the re-render when nothing meaningful changed.
        if (
            state.wallets !== prev.wallets ||
            state.connectedWallet !== prev.connectedWallet ||
            state.account !== prev.account ||
            state.status !== prev.status ||
            state.signer !== prev.signer
        ) {
            snapshot = deriveSnapshot(state);
        }

        listeners.forEach(l => l());
    }

    function deriveSnapshot(s: WalletStoreState): WalletStateSnapshot {
        return Object.freeze({
            wallets: s.wallets,
            connected:
                s.connectedWallet && s.account
                    ? Object.freeze({
                          wallet: s.connectedWallet,
                          account: s.account,
                          signer: s.signer,
                      })
                    : null,
            status: s.status,
        });
    }

    // -- SSR: skip all browser-only initialization --

    if (!isBrowser) {
        return {
            getState: () => state,
            getSnapshot: () => snapshot,
            subscribe: (listener: () => void) => {
                listeners.add(listener);
                return () => listeners.delete(listener);
            },
            connect: () => {
                throw new SolanaError(SOLANA_ERROR__WALLET__NOT_CONNECTED, { operation: 'connect' });
            },
            disconnect: () => Promise.resolve(),
            selectAccount: () => {
                throw new SolanaError(SOLANA_ERROR__WALLET__NOT_CONNECTED, { operation: 'selectAccount' });
            },
            signMessage: () => {
                throw new SolanaError(SOLANA_ERROR__WALLET__NOT_CONNECTED, { operation: 'signMessage' });
            },
            signIn: () => {
                throw new SolanaError(SOLANA_ERROR__WALLET__NOT_CONNECTED, { operation: 'signIn' });
            },
            destroy: () => {},
        };
    }

    // -- Browser-only initialization below this point --

    // -- Signer creation (resilient to read-only wallets) --

    function tryCreateSigner(account: UiWalletAccount): TransactionSigner | (MessageSigner & TransactionSigner) | null {
        try {
            return createSignerFromWalletAccount(account, config.chain);
        } catch {
            // Wallet doesn't support signing (e.g. read-only / watch wallet).
            // Connection proceeds without a signer — account is still usable
            // for discovery, display, and persistence.
            return null;
        }
    }

    // -- Wallet discovery --

    const registry = getWallets();

    function filterWallet(wallet: Wallet): boolean {
        const uiWallet = getOrCreateUiWalletForStandardWallet_DO_NOT_USE_OR_YOU_WILL_BE_FIRED(wallet);
        const supportsChain = uiWallet.chains.includes(config.chain);
        const supportsConnect = uiWallet.features.includes('standard:connect');
        if (!supportsChain || !supportsConnect) return false;
        // Apply custom filter if provided
        return config.filter ? config.filter(uiWallet) : true;
    }

    function buildWalletList(): readonly UiWallet[] {
        return Object.freeze(
            registry
                .get()
                .filter(filterWallet)
                .map(getOrCreateUiWalletForStandardWallet_DO_NOT_USE_OR_YOU_WILL_BE_FIRED),
        );
    }

    setState({ wallets: buildWalletList() });

    const unsubRegister = registry.on('register', () => {
        setState({ wallets: buildWalletList() });
    });
    const unsubUnregister = registry.on('unregister', () => {
        const newWallets = buildWalletList();
        const updates: Partial<WalletStoreState> = { wallets: newWallets };

        if (state.connectedWallet && !newWallets.some(w => w.name === state.connectedWallet!.name)) {
            walletEventsCleanup?.();
            walletEventsCleanup = null;
            updates.connectedWallet = null;
            updates.account = null;
            updates.signer = null;
            updates.status = 'disconnected';
            storage?.removeItem(storageKey);
        }

        setState(updates);
    });

    // -- Connection lifecycle --

    async function connect(uiWallet: UiWallet): Promise<readonly UiWalletAccount[]> {
        userHasSelected = true;
        reconnectCleanup?.();
        reconnectCleanup = null;
        setState({ status: 'connecting' });

        try {
            const connectFeature = getWalletFeature(
                uiWallet,
                'standard:connect',
            ) as StandardConnectFeature['standard:connect'];

            // Snapshot existing accounts before connect — the wallet may
            // already have some accounts visible.
            const existingAccounts = [...uiWallet.accounts];

            await connectFeature.connect();

            // After connect, read accounts from uiWallet.accounts (already
            // UiWalletAccount[]). The connect call's side effect is to populate
            // this list — we don't need to map the raw WalletAccount[] return.
            const allAccounts = uiWallet.accounts;

            if (allAccounts.length === 0) {
                setState({ status: 'disconnected' });
                return allAccounts;
            }

            // Prefer the first newly authorized account. If none are new
            // (e.g. re-connecting to an already-visible wallet), take the first.
            const newAccount = allAccounts.find(a => !existingAccounts.some(e => e.address === a.address));
            const activeAccount = newAccount ?? allAccounts[0];

            const signer = tryCreateSigner(activeAccount);

            walletEventsCleanup?.();
            walletEventsCleanup = subscribeToWalletEvents(uiWallet);

            setState({
                connectedWallet: uiWallet,
                account: activeAccount,
                signer,
                status: 'connected',
            });

            persistAccount(activeAccount);
            return allAccounts;
        } catch (error) {
            setState({ status: 'disconnected' });
            throw error;
        }
    }

    async function disconnect(): Promise<void> {
        const currentWallet = state.connectedWallet;
        setState({ status: 'disconnecting' });

        try {
            if (currentWallet && currentWallet.features.includes('standard:disconnect')) {
                const disconnectFeature = getWalletFeature(
                    currentWallet,
                    'standard:disconnect',
                ) as StandardDisconnectFeature['standard:disconnect'];
                await disconnectFeature.disconnect();
            }
        } finally {
            // Always clear local state and storage, even if standard:disconnect
            // threw (network error, wallet bug). This is intentionally fail-safe:
            // a broken disconnect should not leave the user in a state where they
            // auto-reconnect into a potentially corrupt session on next page load.
            walletEventsCleanup?.();
            walletEventsCleanup = null;

            setState({
                connectedWallet: null,
                account: null,
                signer: null,
                status: 'disconnected',
            });

            storage?.removeItem(storageKey);
        }
    }

    /**
     * Clear local state without calling standard:disconnect on the wallet.
     * Used for wallet-initiated disconnections (accounts removed, chain/feature
     * changes) where the wallet already knows it disconnected. Synchronous,
     * so it can't race with other event handlers.
     */
    function disconnectLocally(): void {
        walletEventsCleanup?.();
        walletEventsCleanup = null;

        setState({
            connectedWallet: null,
            account: null,
            signer: null,
            status: 'disconnected',
        });

        storage?.removeItem(storageKey);
    }

    function selectAccount(account: UiWalletAccount): void {
        if (!state.connectedWallet) {
            throw new SolanaError(SOLANA_ERROR__WALLET__NOT_CONNECTED, {
                operation: 'selectAccount',
            });
        }
        userHasSelected = true;
        const signer = tryCreateSigner(account);
        setState({ account, signer });
        persistAccount(account);
    }

    // -- Message signing --

    async function signMessage(message: Uint8Array): Promise<SignatureBytes> {
        const { signer, connectedWallet } = state;
        if (!signer || !connectedWallet) {
            throw new SolanaError(SOLANA_ERROR__WALLET__NOT_CONNECTED, {
                operation: 'signMessage',
            });
        }
        if (!('modifyAndSignMessages' in signer)) {
            throw new SolanaError(SOLANA_ERROR__WALLET__FEATURE_NOT_SUPPORTED, {
                walletName: connectedWallet.name,
                featureName: 'solana:signMessage',
            });
        }
        // Delegate to the MessageSigner returned by createSignerFromWalletAccount.
        // Exact call signature depends on Kit's MessageSigner interface.
        const results = await (signer as MessageSigner).modifyAndSignMessages([message]);
        return results[0];
    }

    // -- Sign In With Solana --

    async function signIn(
        walletOrInput?: UiWallet | SolanaSignInInput,
        maybeInput?: SolanaSignInInput,
    ): Promise<SolanaSignInOutput> {
        // Determine which overload was called
        const isWalletForm = walletOrInput && 'features' in walletOrInput;
        const targetWallet = isWalletForm ? (walletOrInput as UiWallet) : state.connectedWallet;
        const input = isWalletForm ? maybeInput : (walletOrInput as SolanaSignInInput | undefined);

        if (!targetWallet) {
            throw new SolanaError(SOLANA_ERROR__WALLET__NOT_CONNECTED, {
                operation: 'signIn',
            });
        }
        if (!targetWallet.features.includes('solana:signIn')) {
            throw new SolanaError(SOLANA_ERROR__WALLET__FEATURE_NOT_SUPPORTED, {
                walletName: targetWallet.name,
                featureName: 'solana:signIn',
            });
        }

        const signInFeature = getWalletFeature(targetWallet, 'solana:signIn') as SolanaSignInFeature['solana:signIn'];
        const [result] = await signInFeature.signIn(input ? [input] : [{}]);

        // If called with a wallet (SIWS-as-connect), set up connection state
        // using the account returned by the sign-in response.
        if (isWalletForm) {
            userHasSelected = true;
            reconnectCleanup?.();
            reconnectCleanup = null;

            const account = result.account; // UiWalletAccount from the sign-in response
            const signer = tryCreateSigner(account);

            walletEventsCleanup?.();
            walletEventsCleanup = subscribeToWalletEvents(targetWallet);

            setState({
                connectedWallet: targetWallet,
                account,
                signer,
                status: 'connected',
            });

            persistAccount(account);
        }

        return result;
    }

    // -- Wallet-initiated events --

    function subscribeToWalletEvents(uiWallet: UiWallet): () => void {
        if (!uiWallet.features.includes('standard:events')) {
            return () => {};
        }

        const eventsFeature = getWalletFeature(uiWallet, 'standard:events') as StandardEventsFeature['standard:events'];

        return eventsFeature.on('change', properties => {
            if (properties.accounts) {
                handleAccountsChanged(uiWallet);
            }
            if (properties.chains) {
                handleChainsChanged(uiWallet);
            }
            if (properties.features) {
                handleFeaturesChanged(uiWallet);
            }
        });
    }

    function handleAccountsChanged(uiWallet: UiWallet): void {
        const newAccounts = uiWallet.accounts;

        if (newAccounts.length === 0) {
            disconnectLocally();
            return;
        }

        const currentAddress = state.account?.address;
        const stillPresent = currentAddress ? newAccounts.find(a => a.address === currentAddress) : null;
        const activeAccount = stillPresent ?? newAccounts[0];

        const signer = tryCreateSigner(activeAccount);
        setState({ account: activeAccount, signer });
        persistAccount(activeAccount);
    }

    function handleChainsChanged(uiWallet: UiWallet): void {
        if (!uiWallet.chains.includes(config.chain)) {
            disconnectLocally();
            return;
        }
        // Chain support shifted but our chain is still valid — recreate
        // signer in case chain-related capabilities changed.
        if (state.account) {
            const signer = tryCreateSigner(state.account);
            setState({ signer });
        }
    }

    function handleFeaturesChanged(uiWallet: UiWallet): void {
        // Re-run the filter — if the wallet no longer passes, disconnect.
        if (config.filter && !config.filter(uiWallet)) {
            disconnectLocally();
            return;
        }
        // Features changed but wallet is still valid — recreate signer
        // to pick up new capabilities (e.g. solana:signMessage added)
        // or drop removed ones. createSignerFromWalletAccount is cheap.
        if (state.account) {
            const signer = tryCreateSigner(state.account);
            setState({ signer });
        }
    }

    // -- Auto-connect --

    if (config.autoConnect !== false && storage) {
        // Wrapped in async IIFE because storage.getItem may return a Promise
        // (e.g. IndexedDB). Plugin setup still returns synchronously — status
        // stays 'pending' until the storage read resolves.
        (async () => {
            const savedKey = await storage.getItem(storageKey);
            if (userHasSelected) return;

            if (!savedKey) {
                setState({ status: 'disconnected' });
                return;
            }

            const separatorIndex = savedKey.lastIndexOf(':');
            if (separatorIndex === -1) {
                // Malformed saved key
                storage.removeItem(storageKey);
                setState({ status: 'disconnected' });
                return;
            }

            const walletName = savedKey.slice(0, separatorIndex);
            const existing = state.wallets.find(w => w.name === walletName);

            if (existing) {
                attemptSilentReconnect(savedKey, existing);
            } else if (
                registry.get().some(w => {
                    const ui = getOrCreateUiWalletForStandardWallet_DO_NOT_USE_OR_YOU_WILL_BE_FIRED(w);
                    return ui.name === walletName;
                })
            ) {
                // Wallet is registered but doesn't pass the filter (wrong chain,
                // missing standard:connect, or rejected by config.filter).
                // Clear stale persistence — don't wait for it.
                storage.removeItem(storageKey);
                setState({ status: 'disconnected' });
            } else {
                // Wallet not registered yet — watch for it to appear.
                // Revert status to 'disconnected' after 3s to avoid a perpetual
                // spinner if the wallet is uninstalled. Keep the listener alive
                // so slow-loading extensions can still silently reconnect.
                setState({ status: 'reconnecting' });

                const statusTimeout = setTimeout(() => {
                    if (!userHasSelected && state.status === 'reconnecting') {
                        setState({ status: 'disconnected' });
                    }
                }, 3000);

                const unsubRegisterForReconnect = registry.on('register', () => {
                    if (userHasSelected) {
                        clearTimeout(statusTimeout);
                        unsubRegisterForReconnect();
                        reconnectCleanup = null;
                        return;
                    }
                    const found = buildWalletList().find(w => w.name === walletName);
                    if (found) {
                        clearTimeout(statusTimeout);
                        unsubRegisterForReconnect();
                        reconnectCleanup = null;
                        attemptSilentReconnect(savedKey, found);
                    } else if (
                        registry.get().some(w => {
                            const ui = getOrCreateUiWalletForStandardWallet_DO_NOT_USE_OR_YOU_WILL_BE_FIRED(w);
                            return ui.name === walletName;
                        })
                    ) {
                        // Wallet registered but filtered out — clear stale persistence
                        clearTimeout(statusTimeout);
                        unsubRegisterForReconnect();
                        reconnectCleanup = null;
                        storage.removeItem(storageKey);
                        setState({ status: 'disconnected' });
                    }
                });

                reconnectCleanup = () => {
                    clearTimeout(statusTimeout);
                    unsubRegisterForReconnect();
                };
            }
        })();
    } else {
        // No auto-connect: immediately transition from 'pending' to 'disconnected'
        setState({ status: 'disconnected' });
    }

    async function attemptSilentReconnect(savedAccountKey: string, uiWallet: UiWallet): Promise<void> {
        setState({ status: 'reconnecting' });

        try {
            const connectFeature = getWalletFeature(
                uiWallet,
                'standard:connect',
            ) as StandardConnectFeature['standard:connect'];
            await connectFeature.connect({ silent: true });

            // Read accounts from uiWallet.accounts after connect.
            const allAccounts = uiWallet.accounts;

            if (allAccounts.length === 0) {
                setState({ status: 'disconnected' });
                storage?.removeItem(storageKey);
                return;
            }

            // Check again: user may have connected manually while we were awaiting
            if (userHasSelected) return;

            // Restore specific saved account, fall back to first from same wallet
            const savedAddress = savedAccountKey.slice(savedAccountKey.lastIndexOf(':') + 1);
            const activeAccount = allAccounts.find(a => a.address === savedAddress) ?? allAccounts[0];

            const signer = tryCreateSigner(activeAccount);

            walletEventsCleanup?.();
            walletEventsCleanup = subscribeToWalletEvents(uiWallet);

            setState({
                connectedWallet: uiWallet,
                account: activeAccount,
                signer,
                status: 'connected',
            });
        } catch {
            setState({ status: 'disconnected' });
            storage?.removeItem(storageKey);
        }
    }

    // -- Persistence --

    function persistAccount(account: UiWalletAccount): void {
        storage?.setItem(storageKey, `${state.connectedWallet!.name}:${account.address}`);
    }

    // -- Public store API --

    return {
        getState: () => state,
        getSnapshot: () => snapshot,
        subscribe: (listener: () => void) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        connect,
        disconnect,
        selectAccount,
        signMessage,
        signIn,
        destroy: () => {
            unsubRegister();
            unsubUnregister();
            walletEventsCleanup?.();
            walletEventsCleanup = null;
            reconnectCleanup?.();
            reconnectCleanup = null;
            listeners.clear();
        },
    };
}
```

## Signer Caching

The signer is created via `tryCreateSigner()` (wrapping `createSignerFromWalletAccount()`) when an account becomes active, and stored in `state.signer`. It is not recreated on every `client.payer` access -- the getter simply reads `state.signer`.

If `createSignerFromWalletAccount` throws (e.g. the wallet doesn't support any signing features), `tryCreateSigner` catches the error and returns `null`. The wallet is still connected — the account is set, events work, persistence works — but `snapshot.connected.signer` is `null`. When using `walletAsPayer`, `client.payer` is `undefined` (no signer available).

This ensures referential stability, which matters for React's dependency arrays and avoids redundant codec/wrapper creation.

The signer is invalidated and recreated when:

- The user connects to a different wallet
- The user switches accounts via `selectAccount`
- The wallet emits a `change` event that updates accounts
- The wallet emits a `change` event for features (e.g. `solana:signMessage` added or removed)
- The wallet emits a `change` event for chains (if the configured chain is still supported)

A feature change event may cause a previously null signer to become non-null (e.g. a watch wallet adds signing support) or vice versa.

### Signer types

The bridge function (`createSignerFromWalletAccount`) inspects the wallet's features and returns the appropriate signer type:

- `TransactionModifyingSigner` if the wallet supports `solana:signTransaction`
- `TransactionSendingSigner` if the wallet supports `solana:signAndSendTransaction`
- `MessageSigner` (intersected with the above) if the wallet supports `solana:signMessage`
- Throws if the wallet supports none of the above (caught by `tryCreateSigner`)

All variants satisfy `TransactionSigner`, which is what `client.payer` expects. Kit's transaction execution automatically uses the appropriate signing path (e.g. `TransactionSendingSigner` lets the wallet submit the transaction itself). The `signMessage` method on the client checks at runtime whether the cached signer includes `MessageSigner`. The wallet plugin delegates signer construction entirely to the bridge function.

## Payer Integration Detail

### How the getter works

`walletAsPayer` uses `Object.defineProperty` to define a dynamic getter on `payer`. The getter returns the current wallet signer, or `undefined` when disconnected or read-only:

```typescript
Object.defineProperty(obj, 'payer', {
    get() {
        return store.getState().signer;
    },
    enumerable: true,
    configurable: true,
});
```

This getter is preserved through subsequent `.use()` calls because:

1. `addUse` (updated in the plugin lifecycle RFC) uses `Object.getOwnPropertyDescriptors` instead of spread, preserving the getter.
2. Subsequent plugins using `extendClient` also preserve it.
3. The final frozen client returned by `addUse` retains the getter -- `Object.freeze` does not strip getters.

Note: downstream plugins should use `extendClient` rather than spread to ensure the payer getter is preserved.

### Interaction with planAndSendTransactions plugin

The `planAndSendTransactions` plugin accesses `client.payer` at transaction time. Because the payer is a getter, it always resolves to the current value:

- User connects wallet → next transaction uses the wallet signer
- User switches accounts → next transaction uses the new account's signer
- User disconnects → `client.payer` is `undefined`, transaction fails explicitly

No client reconstruction is needed. The client is a long-lived object.

## Subscribability Contract

All wallet state is accessed via `client.wallet.getSnapshot()`. There are no individual getters.

`subscribe` fires on every internal state change. Listeners don't know what changed; they just know "something changed."

`getSnapshot` returns a memoized frozen object. A new snapshot reference is only created when a snapshot field actually changes (compared via reference equality in `setState`). React's `useSyncExternalStore` uses `Object.is` to compare successive `getSnapshot` returns — same reference means no re-render, new reference means re-render. Because we control when the snapshot object is recreated, re-renders only happen on meaningful state changes.

### Framework adapter examples

**React:**

```tsx
function useWalletState(client) {
    return useSyncExternalStore(client.wallet.subscribe, client.wallet.getSnapshot);
}
```

**Vue:**

```typescript
function useWalletState(client) {
    const state = shallowRef(client.wallet.getSnapshot());
    onMounted(() => {
        const unsub = client.wallet.subscribe(() => {
            state.value = client.wallet.getSnapshot();
        });
        onUnmounted(unsub);
    });
    return state;
}
```

**Svelte:**

```typescript
const walletState = readable(client.wallet.getSnapshot(), set => {
    return client.wallet.subscribe(() => set(client.wallet.getSnapshot()));
});
```

**Solid:**

```typescript
const [walletState, setWalletState] = createSignal(client.wallet.getSnapshot());
onMount(() => {
    onCleanup(client.wallet.subscribe(() => setWalletState(client.wallet.getSnapshot())));
});
```

## Storage

### Storage adapter

Persistence is handled via a pluggable storage adapter following the Web Storage API shape. `localStorage` and `sessionStorage` can be passed directly with zero wrapping.

```typescript
type WalletStorage = {
    getItem(key: string): string | null | Promise<string | null>;
    setItem(key: string, value: string): void | Promise<void>;
    removeItem(key: string): void | Promise<void>;
};
```

The type is duck-typed rather than extending the DOM `Storage` interface, so it works in any environment without requiring DOM lib types. The async-compatible signatures match wagmi's storage interface. `localStorage` and `sessionStorage` satisfy this directly since sync return values are valid where `T | Promise<T>` is expected. Async backends like IndexedDB or encrypted storage can return Promises.

### What is persisted

The plugin persists a `walletName:accountAddress` string (e.g. `"Phantom:ABC123..."`). This identifies both the wallet and the specific account the user selected. On reconnect, the plugin attempts to restore the exact account; if that account is no longer available but the wallet is, it falls back to the first available account.

This matches the persistence format used by Kit's existing React hooks.

### Default storage

When no `storage` option is provided, the plugin defaults to `localStorage` in the browser. On the server, storage is always skipped regardless of the option.

### Storage examples

```typescript
// Default — uses localStorage in browser, skipped on server
wallet({ chain: 'solana:mainnet' });

// Use sessionStorage
wallet({ chain: 'solana:mainnet', storage: sessionStorage });

// Use a reactive store
wallet({
    chain: 'solana:mainnet',
    storage: {
        getItem: key => myStore.getState().walletKey,
        setItem: (key, value) => myStore.setState({ walletKey: value }),
        removeItem: key => myStore.setState({ walletKey: null }),
    },
});

// Disable persistence explicitly
wallet({ chain: 'solana:mainnet', storage: null });
```

## Configuration

```typescript
type WalletPluginConfig = {
    /**
     * The Solana chain this client targets.
     * One client = one chain. To switch networks,
     * create a separate client with a different chain and RPC endpoint.
     */
    chain: SolanaChain;

    /**
     * Optional filter function for wallet discovery.
     * Called for each wallet that supports the configured chain and
     * standard:connect. Return true to include the wallet, false to exclude.
     * Useful for requiring specific features, whitelisting wallets,
     * or any other application-specific filtering.
     *
     * @example
     * // Require signAndSendTransaction
     * filter: (w) => w.features.includes('solana:signAndSendTransaction')
     *
     * @example
     * // Whitelist specific wallets
     * filter: (w) => ['Phantom', 'Solflare'].includes(w.name)
     */
    filter?: (wallet: UiWallet) => boolean;

    /**
     * Whether to attempt silent reconnection on startup using
     * the persisted wallet account from storage.
     * @default true
     */
    autoConnect?: boolean;

    /**
     * Storage adapter for persisting the selected wallet account.
     * Follows the Web Storage API shape (getItem/setItem/removeItem).
     * Supports both sync and async backends.
     * localStorage and sessionStorage satisfy this interface directly.
     * Pass null to disable persistence entirely.
     * Ignored on the server (storage is always skipped in SSR).
     * @default localStorage
     */
    storage?: WalletStorage | null;

    /**
     * Storage key used for persistence.
     * @default 'kit-wallet'
     */
    storageKey?: string;
};
```

## Error Handling

### Error codes

Two new error codes added to `@solana/errors`:

```typescript
SOLANA_ERROR__WALLET__NOT_CONNECTED;
// context: { operation: string }
// message: "Cannot $operation: no wallet connected"

SOLANA_ERROR__WALLET__FEATURE_NOT_SUPPORTED;
// context: { walletName: string, featureName: string }
// message: "Wallet \"$walletName\" does not support $featureName"
```

Wallet-originated errors (e.g. user rejecting a connection prompt) are propagated unchanged.

### Error behavior

| Scenario                                | Behavior                                                                                          |
| --------------------------------------- | ------------------------------------------------------------------------------------------------- |
| SSR (server environment)                | Status stays `'pending'`, all actions throw `SOLANA_ERROR__WALLET__NOT_CONNECTED`                 |
| User rejects connection prompt          | `connect()` propagates wallet error, status returns to `disconnected`                             |
| Wallet does not support signing         | Connection succeeds, `connected.signer` is `null`, payer is `undefined`, sign methods throw       |
| Wallet does not pass filter             | Filtered out at discovery time; disconnected if filter fails after feature change                 |
| Wallet unregisters while connected      | Automatic disconnection, subscribers notified                                                     |
| Silent reconnect fails                  | Status -> `disconnected`, persisted account cleared                                               |
| No wallets discovered                   | `state.wallets` is empty, UI can prompt user to install a wallet                                  |
| `standard:disconnect` not supported     | Disconnect proceeds -- clear local state regardless                                               |
| `selectAccount` without connection      | Throws `SOLANA_ERROR__WALLET__NOT_CONNECTED` with `{ operation: 'selectAccount' }`                |
| `signMessage` without connection        | Throws `SOLANA_ERROR__WALLET__NOT_CONNECTED` with `{ operation: 'signMessage' }`                  |
| `signMessage` on wallet without feature | Throws `SOLANA_ERROR__WALLET__FEATURE_NOT_SUPPORTED` with `{ featureName: 'solana:signMessage' }` |
| `signIn` without connection             | Throws `SOLANA_ERROR__WALLET__NOT_CONNECTED` with `{ operation: 'signIn' }`                       |
| `signIn` on wallet without feature      | Throws `SOLANA_ERROR__WALLET__FEATURE_NOT_SUPPORTED` with `{ featureName: 'solana:signIn' }`      |

`connect()` and `disconnect()` propagate wallet errors to the caller unchanged. Internal errors (reconnect failures, storage errors) are logged via `console.warn` but do not throw.

## Design Decisions

**Descriptor-preserving composition.** The plugin uses `extendClient` from plugin-core to build the client, preserving getters and symbol-keyed properties from previous plugins. The updated `addUse` also preserves descriptors through `.use()` calls. Downstream plugins should use `extendClient` rather than spread to avoid flattening the dynamic payer getter.

**Single chain per client.** Signers are bound to a specific chain at creation time. Switching chains requires a different RPC endpoint too. One client = one network.

**Single wallet connection.** One active wallet at a time. dApps needing multiple can access `getSnapshot().wallets` and manage additional connections via wallet-standard APIs.

**SSR-safe.** Both `wallet` and `walletAsPayer` gracefully degrade on the server — status stays `'pending'`, wallet list is empty, payer is `undefined` (when using `walletAsPayer`), storage is skipped, all actions throw `SOLANA_ERROR__WALLET__NOT_CONNECTED`. The same client chain works on both server and browser without conditional `.use()` calls.

**`pending` status.** Initial status is `'pending'`, not `'disconnected'`. This lets UI distinguish "we haven't checked yet" (render nothing / skeleton) from "we checked and there's no wallet" (render connect button). On the server, status stays `'pending'` permanently. In the browser, it transitions to `'disconnected'` or `'reconnecting'` once the storage read completes.

**`localStorage` as default storage.** The plugin defaults to `localStorage` in the browser and skips storage on the server. Consumers don't need to reference `localStorage` directly (which would throw a `ReferenceError` on the server), and the common case requires no configuration.

**Single subscribe listener.** Fires on any state change. Frameworks needing field-level selectivity use their own selector patterns (e.g. `useSyncExternalStoreWithSelector`).

**Two plugins: `wallet` and `walletAsPayer`.** The payer decision is expressed at the type level, not via a config flag. `wallet()` adds wallet state and actions without touching `client.payer`. `walletAsPayer()` additionally overrides `client.payer` with a dynamic getter. The choice is in which function you import — the types tell you exactly what you get.

**Web Storage API for persistence.** Duck-typed to match the `getItem`/`setItem`/`removeItem` shape used by wagmi and Zustand. Supports both sync and async backends — `localStorage` can be passed directly, and async backends (IndexedDB, encrypted storage) return Promises.

**Account-level persistence.** Persists `walletName:accountAddress` (parsed with `lastIndexOf(':')` since base58 addresses never contain colons). Preserves the user's account selection across sessions.

**Sync-only cleanup.** All cleanup operations (unsubscribing from events, clearing listeners) are synchronous. `Symbol.asyncDispose` support may be added to plugin-core later as a separate utility.

**SIWS-as-connect.** `signIn` supports two overloads — sign in with the connected wallet, or sign in with a specific wallet to implicitly connect. The wallet form sets up full connection state using the account returned in the sign-in response.

**Signer recreation on wallet events.** When the wallet emits feature or chain changes, the signer is recreated to reflect new capabilities (e.g. `solana:signMessage` added) or drop removed ones. `createSignerFromWalletAccount` is cheap (no network calls), so this is practical on every event.

**Local disconnect for wallet-initiated events.** `disconnectLocally()` clears local state synchronously without calling `standard:disconnect` on the wallet. Used when the wallet itself initiated the change (accounts removed, chain/feature changes). Avoids the async gap and redundant round-trip of calling back to a wallet that already knows it disconnected.

**Status timeout on reconnect.** When waiting for a previously connected wallet to register, status reverts from `reconnecting` to `disconnected` after 3 seconds. The registry listener stays alive — if the wallet appears later, it silently reconnects. This prevents a perpetual spinner for uninstalled wallets while still supporting slow-loading extensions.

**`userHasSelected` flag.** Tracks whether the user has made an explicit choice (via `connect`, `selectAccount`, or `signIn` with a wallet). When true, the auto-restore flow will not override the user's selection, matching the `wasSetterInvokedRef` pattern from `@solana/react`.

**Read-only wallet support.** `tryCreateSigner` wraps `createSignerFromWalletAccount` in a try/catch. If the wallet doesn't support any signing features (e.g. a watch-only wallet), connection still succeeds — the account is set, events fire, persistence works. `connected.signer` in the snapshot is `null`, letting UI distinguish connected-with-signer from connected-without-signer. When using `walletAsPayer`, `client.payer` is `undefined`.

---

## Implementation notes (post-review)

The following deviations and fixes were identified during spec review and should be applied during implementation rather than requiring a spec revision.

**`withCleanup` not yet released.** `withCleanup` has landed in `@solana/plugin-core` but is not yet in a released build of `@solana/kit`. Replace `...withCleanup(client, () => store.destroy())` with a direct property:

```typescript
[Symbol.dispose]: () => store.destroy(),
```

This won't chain with other dispose plugins (LIFO ordering won't apply) but is sufficient until `withCleanup` ships.

**Missing dependency: `@wallet-standard/features`.** `WalletPluginConfig.features` uses the `IdentifierArray` type from `@wallet-standard/features`. Add it to `dependencies`:

```json
"@wallet-standard/features": "^1.x"
```

**`extendClient` source.** The Prerequisites section mentions `@solana/plugin-core`, but the correct import in practice is `from '@solana/kit'` (which re-exports it). `withCleanup` is not imported at all (see above).

**Unhandled rejection in auto-connect IIFE.** The fire-and-forget `(async () => { ... })()` has no top-level error handler. If `storage.getItem()` rejects, it produces an unhandled promise rejection. Add a `.catch()` that resets status to `'disconnected'` when storage fails before `userHasSelected` is set.

**`autoConnect` JSDoc.** The `autoConnect` config option has no effect when `storage` is not provided (the block is gated on `config.autoConnect !== false && storage`). Add a note to the JSDoc: _"Has no effect if `storage` is not provided."_

**`signIn` overload discriminant (low risk).** The `'features' in walletOrInput` check works for now but would misfire if `SolanaSignInInput` ever gains a `features` field. A more defensive check would combine multiple `UiWallet`-exclusive fields (e.g. `'accounts' in walletOrInput && 'chains' in walletOrInput`).
