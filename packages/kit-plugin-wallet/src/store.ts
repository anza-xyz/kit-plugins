import { type SignatureBytes, SOLANA_ERROR__WALLET__NOT_CONNECTED, SolanaError } from '@solana/kit';
import { createSignerFromWalletAccount } from '@solana/wallet-account-signer';
import {
    SolanaSignIn,
    type SolanaSignInFeature,
    type SolanaSignInInput,
    type SolanaSignInOutput,
    SolanaSignMessage,
    type SolanaSignMessageFeature,
} from '@solana/wallet-standard-features';
import { getWallets } from '@wallet-standard/app';
import {
    StandardConnect,
    type StandardConnectFeature,
    StandardDisconnect,
    type StandardDisconnectFeature,
    StandardEvents,
    type StandardEventsFeature,
} from '@wallet-standard/features';
import type { UiWallet, UiWalletAccount } from '@wallet-standard/ui';
import { getWalletFeature } from '@wallet-standard/ui-features';
import { getOrCreateUiWalletForStandardWallet, getWalletForHandle } from '@wallet-standard/ui-registry';

import type {
    WalletActionOptions,
    WalletNamespace,
    WalletPluginConfig,
    WalletSigner,
    WalletState,
    WalletStatus,
    WalletStorage,
} from './types';

// -- Internal types ---------------------------------------------------------

export type WalletStore = WalletNamespace & {
    [Symbol.dispose]: () => void;
};

// Flat internal state for easier updates
type WalletStoreState = {
    account: UiWalletAccount | null;
    connectedWallet: UiWallet | null;
    signer: WalletSigner | null;
    status: WalletStatus;
    wallets: readonly UiWallet[];
};

// -- Store ------------------------------------------------------------------

/** @internal */
export function createWalletStore(config: WalletPluginConfig): WalletStore {
    // -- SSR guard: on the server, return an inert stub ---------------------

    if (!__BROWSER__ || __REACTNATIVE__) {
        const ssrSnapshot: WalletState = Object.freeze({
            connected: null,
            status: 'pending' as const,
            wallets: Object.freeze([]) as readonly UiWallet[],
        });
        return {
            connect: () => {
                throw new SolanaError(SOLANA_ERROR__WALLET__NOT_CONNECTED, { operation: 'connect' });
            },
            disconnect: () => Promise.resolve(),
            getState: () => ssrSnapshot,
            selectAccount: () => {
                throw new SolanaError(SOLANA_ERROR__WALLET__NOT_CONNECTED, { operation: 'selectAccount' });
            },
            signIn: () => {
                throw new SolanaError(SOLANA_ERROR__WALLET__NOT_CONNECTED, { operation: 'signIn' });
            },
            signMessage: () => {
                throw new SolanaError(SOLANA_ERROR__WALLET__NOT_CONNECTED, { operation: 'signMessage' });
            },
            subscribe: () => () => {},
            [Symbol.dispose]: () => {},
        };
    }

    // -- Browser-only initialization below this point ----------------------

    let state: WalletStoreState = {
        account: null,
        connectedWallet: null,
        signer: null,
        status: 'pending',
        wallets: [],
    };

    const listeners = new Set<() => void>();
    let walletEventsCleanup: (() => void) | null = null;
    let reconnectCleanup: (() => void) | null = null;
    let userHasSelected = false;
    let connectGeneration = 0;

    // Resolve storage: default to localStorage in browser, null to disable.
    const storage: WalletStorage | null = config.storage === null ? null : (config.storage ?? localStorage);
    const storageKey = config.storageKey ?? 'kit-wallet';

    // -- State management --------------------------------------------------

    function deriveSnapshot(s: WalletStoreState): WalletState {
        return Object.freeze({
            connected:
                s.connectedWallet && s.account
                    ? Object.freeze({
                          account: s.account,
                          signer: s.signer,
                          wallet: s.connectedWallet,
                      })
                    : null,
            status: s.status,
            wallets: s.wallets,
        });
    }

    let snapshot: WalletState = deriveSnapshot(state);

    function updateState(updates: Partial<WalletStoreState>): void {
        const prev = state;
        state = { ...state, ...updates };

        // Only create a new snapshot and notify listeners when a
        // snapshot-relevant field actually changed. This ensures
        // referential stability for useSyncExternalStore and avoids
        // unnecessary re-renders in non-React frameworks.
        if (
            state.wallets !== prev.wallets ||
            state.connectedWallet !== prev.connectedWallet ||
            state.account !== prev.account ||
            state.status !== prev.status ||
            state.signer !== prev.signer
        ) {
            snapshot = deriveSnapshot(state);
            listeners.forEach(l => l());
        }
    }

    // -- Signer creation ---------------------------------------------------

    function tryCreateSigner(account: UiWalletAccount): WalletSigner | null {
        try {
            // `createSignerFromWalletAccount` throws for chains the wallet
            // doesn't support — which we catch below. Non-Solana chains
            // therefore degrade to `signer: null`, matching the read-only
            // wallet contract.
            return createSignerFromWalletAccount(account, config.chain);
        } catch {
            // Wallet doesn't support signing (read-only / watch wallet, or a
            // non-Solana chain).
            return null;
        }
    }

    // -- Wallet discovery --------------------------------------------------

    // `getWallets()` is a wallet-standard function that returns the `Wallets` API
    // This includes a `get()` function to get the current list of wallets, and
    // an `on()` function to subscribe to wallet registration/unregistration events.
    const registry = getWallets();

    function filterWallet(uiWallet: UiWallet): boolean {
        const supportsChain = uiWallet.chains.includes(config.chain);
        const supportsConnect = uiWallet.features.includes(StandardConnect);
        if (!supportsChain || !supportsConnect) return false;
        return config.filter ? config.filter(uiWallet) : true;
    }

    function buildWalletList(): readonly UiWallet[] {
        return Object.freeze(registry.get().map(getOrCreateUiWalletForStandardWallet).filter(filterWallet));
    }

    updateState({ wallets: buildWalletList() });

    // Listen for new wallets being registered
    const unsubRegister = registry.on('register', () => {
        updateState({ wallets: buildWalletList() });
    });

    // Listen for wallets being unregistered — if the connected wallet is removed, disconnect
    const unsubUnregister = registry.on('unregister', () => {
        const newWallets = buildWalletList();
        const updates: Partial<WalletStoreState> = { wallets: newWallets };

        // If the connected wallet was unregistered, disconnect locally.
        if (state.connectedWallet && !newWallets.some(w => w.name === state.connectedWallet!.name)) {
            walletEventsCleanup?.();
            walletEventsCleanup = null;
            updates.connectedWallet = null;
            updates.account = null;
            updates.signer = null;
            updates.status = 'disconnected';
            clearPersistedAccount();
        }

        updateState(updates);
    });

    // -- Wallet-initiated events -------------------------------------------

    function cancelReconnect(): void {
        reconnectCleanup?.();
        reconnectCleanup = null;
    }

    function resubscribeToWalletEvents(uiWallet: UiWallet): void {
        walletEventsCleanup?.();
        walletEventsCleanup = subscribeToWalletEvents(uiWallet);
    }

    function setConnected(account: UiWalletAccount, wallet: UiWallet, options?: { persist?: boolean }): void {
        const signer = tryCreateSigner(account);
        resubscribeToWalletEvents(wallet);
        updateState({ account, connectedWallet: wallet, signer, status: 'connected' });
        if (options?.persist !== false) {
            persistAccount(account, wallet);
        }
    }

    function refreshUiWallet(staleUiWallet: UiWallet): UiWallet {
        const rawWallet = getWalletForHandle(staleUiWallet);
        return getOrCreateUiWalletForStandardWallet(rawWallet);
    }

    function subscribeToWalletEvents(uiWallet: UiWallet): () => void {
        if (!uiWallet.features.includes(StandardEvents)) {
            return () => {};
        }

        const eventsFeature = getWalletFeature(
            uiWallet,
            StandardEvents,
        ) as StandardEventsFeature[typeof StandardEvents];

        // The handler ignores the changed-property flags (`accounts`, `chains`,
        // `features`) and instead reconciles the active account against the
        // refreshed wallet. The signer is derived entirely from the account's
        // features and chains, and the wallet-ui registry regenerates the
        // account reference precisely when one of those changes — so the
        // account reference is the single source of truth for whether the
        // signer is affected, regardless of which flag the wallet sets.
        return eventsFeature.on('change', () => {
            const refreshed = refreshUiWallet(uiWallet);

            // If the wallet no longer passes the filter (e.g. it dropped the
            // configured chain or a required feature), disconnect.
            if (!filterWallet(refreshed)) {
                disconnectLocally();
                return;
            }

            const result = reconcileActiveAccount(refreshed);
            if (result === null) {
                disconnectLocally();
                return;
            }

            // `connectedWallet` is always refreshed so consumers reading
            // `getState().connected.wallet` see current metadata; the signer
            // (in `result`) only churns when the active account changed, which
            // keeps the snapshot referentially stable on no-op change events.
            updateState({ connectedWallet: refreshed, ...result });

            if (result.account) {
                persistAccount(result.account, refreshed);
            }
        });
    }

    function reconcileActiveAccount(wallet: UiWallet): Partial<WalletStoreState> | null {
        const newAccounts = wallet.accounts;

        // No accounts left — the caller disconnects.
        if (newAccounts.length === 0) return null;

        const currentAddress = state.account?.address;
        const stillPresent = currentAddress ? newAccounts.find(a => a.address === currentAddress) : null;
        const activeAccount = stillPresent ?? newAccounts[0];

        // Same reference — nothing the signer depends on changed, so leave the
        // signer untouched to preserve referential stability.
        if (activeAccount === state.account) return {};

        // The active account changed (switched, removed, or regenerated because
        // its features/chains changed) — recreate the signer for it.
        return { account: activeAccount, signer: tryCreateSigner(activeAccount) };
    }

    // -- Connection lifecycle ----------------------------------------------

    async function connect(uiWallet: UiWallet, options?: WalletActionOptions): Promise<readonly UiWalletAccount[]> {
        options?.abortSignal?.throwIfAborted();
        userHasSelected = true;
        cancelReconnect();
        const generation = ++connectGeneration;
        updateState({ status: 'connecting' });

        try {
            const connectFeature = getWalletFeature(
                uiWallet,
                StandardConnect,
            ) as StandardConnectFeature[typeof StandardConnect];

            // Snapshot existing accounts before connect.
            const existingAccounts = [...uiWallet.accounts];

            await connectFeature.connect();

            // A newer connect/signIn was started while we were awaiting. Reject
            // with an `AbortError` so this superseded call settles in the
            // standard, ignorable way (matching the abort-signal contract) while
            // the newer request owns the connection. The `catch` below leaves
            // that newer connection untouched, since `generation` no longer
            // matches `connectGeneration`.
            if (generation !== connectGeneration) {
                throw new DOMException('Wallet connect was superseded by a newer connect or sign-in', 'AbortError');
            }

            // Refresh UiWallet to get updated accounts after connect.
            const refreshedWallet = refreshUiWallet(uiWallet);
            const allAccounts = refreshedWallet.accounts;

            if (allAccounts.length === 0) {
                disconnectLocally();
                return allAccounts;
            }

            // Prefer the first newly authorized account.
            const newAccount = allAccounts.find(a => !existingAccounts.some(e => e.address === a.address));
            const activeAccount = newAccount ?? allAccounts[0];

            setConnected(activeAccount, refreshedWallet);
            return allAccounts;
        } catch (error) {
            // Only clean up if we're still the active connection attempt.
            if (generation === connectGeneration) {
                disconnectLocally();
            }
            throw error;
        }
    }

    async function disconnect(options?: WalletActionOptions): Promise<void> {
        options?.abortSignal?.throwIfAborted();
        if (!state.connectedWallet) return;

        const currentWallet = state.connectedWallet;
        const generation = connectGeneration;
        updateState({ status: 'disconnecting' });

        try {
            if (currentWallet.features.includes(StandardDisconnect)) {
                const disconnectFeature = getWalletFeature(
                    currentWallet,
                    StandardDisconnect,
                ) as StandardDisconnectFeature[typeof StandardDisconnect];
                await disconnectFeature.disconnect();
            }
        } finally {
            // Only clean up if no new connect/signIn started while we were awaiting.
            if (generation === connectGeneration) {
                disconnectLocally();
            }
        }
    }

    function disconnectLocally(): void {
        walletEventsCleanup?.();
        walletEventsCleanup = null;

        updateState({
            account: null,
            connectedWallet: null,
            signer: null,
            status: 'disconnected',
        });

        clearPersistedAccount();
    }

    function selectAccount(account: UiWalletAccount): void {
        if (!state.connectedWallet) {
            throw new SolanaError(SOLANA_ERROR__WALLET__NOT_CONNECTED, { operation: 'selectAccount' });
        }
        const refreshed = refreshUiWallet(state.connectedWallet);
        const selectedAccount = refreshed.accounts.find(a => a.address === account.address);
        if (!selectedAccount) {
            throw new Error(`Account ${account.address} is not available in wallet "${state.connectedWallet.name}"`);
        }
        userHasSelected = true;
        // No-op when re-selecting the already-active account. Skipping here
        // avoids recreating the signer — which is a fresh object each call —
        // and the spurious listener notification (and re-render) that the new
        // signer reference would otherwise trigger.
        if (selectedAccount === state.account && refreshed === state.connectedWallet) {
            return;
        }
        const signer = tryCreateSigner(selectedAccount);
        updateState({ account: selectedAccount, connectedWallet: refreshed, signer });
        persistAccount(selectedAccount, refreshed);
    }

    // -- Message signing ---------------------------------------------------

    async function signMessage(message: Uint8Array, options?: WalletActionOptions): Promise<SignatureBytes> {
        options?.abortSignal?.throwIfAborted();
        const { connectedWallet, account } = state;
        if (!connectedWallet || !account) {
            throw new SolanaError(SOLANA_ERROR__WALLET__NOT_CONNECTED, { operation: 'signMessage' });
        }
        // Use the wallet feature directly rather than going through the cached
        // signer. This decouples message signing from transaction signing —
        // a wallet that supports solana:signMessage but not transaction signing
        // still works. getWalletFeature throws WalletStandardError if the
        // feature is not supported.
        const signMessageFeature = getWalletFeature(
            connectedWallet,
            SolanaSignMessage,
        ) as SolanaSignMessageFeature[typeof SolanaSignMessage];
        const [output] = await signMessageFeature.signMessage({ account, message });
        return output.signature as SignatureBytes;
    }

    // -- Sign In With Solana (SIWS-as-connect) ------------------------------

    async function signIn(
        uiWallet: UiWallet,
        input: SolanaSignInInput,
        options?: WalletActionOptions,
    ): Promise<SolanaSignInOutput> {
        options?.abortSignal?.throwIfAborted();

        // Resolve the feature before mutating any state. getWalletFeature throws
        // WalletStandardError synchronously when the wallet doesn't support
        // solana:signIn — doing this first means an unsupported wallet is a
        // no-op that never tears down an existing connection.
        const signInFeature = getWalletFeature(uiWallet, SolanaSignIn) as SolanaSignInFeature[typeof SolanaSignIn];

        userHasSelected = true;
        cancelReconnect();
        const generation = ++connectGeneration;
        updateState({ status: 'connecting' });

        try {
            const [result] = await signInFeature.signIn(input);

            // A newer connect/signIn was started while we were awaiting. Reject
            // with an `AbortError` (matching the abort-signal contract) so the
            // superseded call settles in the standard, ignorable way while the
            // newer request owns the connection.
            if (generation !== connectGeneration) {
                throw new DOMException('Wallet sign-in was superseded by a newer connect or sign-in', 'AbortError');
            }

            // Set up full connection state using the account from the sign-in response.
            const refreshedWallet = refreshUiWallet(uiWallet);
            const activeAccount = refreshedWallet.accounts.find(a => a.address === result.account.address);

            if (!activeAccount) {
                // The signed-in account isn't in the wallet — bad state, disconnect
                // so the user can try a fresh connect/sign-in.
                disconnectLocally();
                return result;
            }

            setConnected(activeAccount, refreshedWallet);
            return result;
        } catch (error) {
            if (generation === connectGeneration) {
                disconnectLocally();
            }
            throw error;
        }
    }

    // -- Persistence -------------------------------------------------------

    function ignoreStorageFailure(operation: () => Promise<void> | void): void {
        void (async () => {
            try {
                await operation();
            } catch {
                // Persistence is best-effort; wallet state is the source of truth.
            }
        })();
    }

    function persistAccount(account: UiWalletAccount, wallet: UiWallet): void {
        if (!storage) return;
        ignoreStorageFailure(() => storage.setItem(storageKey, `${wallet.name}:${account.address}`));
    }

    function clearPersistedAccount(): void {
        if (!storage) return;
        ignoreStorageFailure(() => storage.removeItem(storageKey));
    }

    // -- Auto-connect ------------------------------------------------------

    if (config.autoConnect !== false && storage) {
        (async () => {
            const savedKey = await storage.getItem(storageKey);
            // Don't auto-connect if the user has selected a wallet
            if (userHasSelected) return;

            if (!savedKey) {
                updateState({ status: 'disconnected' });
                return;
            }

            const separatorIndex = savedKey.lastIndexOf(':');
            if (separatorIndex === -1) {
                // Malformed saved key.
                updateState({ status: 'disconnected' });
                clearPersistedAccount();
                return;
            }

            const walletName = savedKey.slice(0, separatorIndex);
            const savedAddress = savedKey.slice(separatorIndex + 1);
            const existing = state.wallets.find(w => w.name === walletName);

            if (existing) {
                await attemptSilentReconnect(savedAddress, existing);
            } else if (
                registry.get().some(w => {
                    const ui = getOrCreateUiWalletForStandardWallet(w);
                    return ui.name === walletName;
                })
            ) {
                // Wallet registered but doesn't pass the filter.
                updateState({ status: 'disconnected' });
                clearPersistedAccount();
            } else {
                // Wallet not registered yet — wait for it to appear.
                updateState({ status: 'reconnecting' });

                // Change state to disconnected after 3s
                // Note that the listener stays alive until reconnect is cancelled, so this is
                // just affecting how long the UI shows reconnecting
                const statusTimeout = setTimeout(() => {
                    if (!userHasSelected && state.status === 'reconnecting') {
                        updateState({ status: 'disconnected' });
                    }
                }, 3000);

                const unsubRegisterForReconnect = registry.on(
                    'register',
                    () =>
                        void (async () => {
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
                                await attemptSilentReconnect(savedAddress, found);
                            } else if (
                                registry.get().some(w => {
                                    const ui = getOrCreateUiWalletForStandardWallet(w);
                                    return ui.name === walletName;
                                })
                            ) {
                                // Wallet registered but filtered out.
                                clearTimeout(statusTimeout);
                                unsubRegisterForReconnect();
                                reconnectCleanup = null;
                                updateState({ status: 'disconnected' });
                                clearPersistedAccount();
                            }
                        })().catch(() => {
                            // Reconnect failed — fall back to disconnected.
                            updateState({ status: 'disconnected' });
                        }),
                );

                reconnectCleanup = () => {
                    clearTimeout(statusTimeout);
                    unsubRegisterForReconnect();
                };
            }
        })().catch(() => {
            // Storage read failed — fall back to disconnected.
            if (!userHasSelected) {
                updateState({ status: 'disconnected' });
            }
        });
    } else {
        // No auto-connect: immediately transition from 'pending' to 'disconnected'.
        updateState({ status: 'disconnected' });
    }

    async function attemptSilentReconnect(savedAddress: string, uiWallet: UiWallet): Promise<void> {
        const generation = ++connectGeneration;
        updateState({ status: 'reconnecting' });

        try {
            const connectFeature = getWalletFeature(
                uiWallet,
                StandardConnect,
            ) as StandardConnectFeature[typeof StandardConnect];
            await connectFeature.connect({ silent: true });

            // A newer connect/signIn was started while we were awaiting — bail.
            if (generation !== connectGeneration) return;

            const refreshedWallet = refreshUiWallet(uiWallet);
            const allAccounts = refreshedWallet.accounts;

            if (allAccounts.length === 0) {
                updateState({ status: 'disconnected' });
                clearPersistedAccount();
                return;
            }

            // Restore the specific saved account, fall back to first from same wallet.
            const activeAccount = allAccounts.find(a => a.address === savedAddress) ?? allAccounts[0];

            setConnected(activeAccount, refreshedWallet, { persist: false });
        } catch {
            if (generation === connectGeneration) {
                updateState({ status: 'disconnected' });
                clearPersistedAccount();
            }
        }
    }

    // -- Public API --------------------------------------------------------

    return {
        connect,
        disconnect,
        getState: () => snapshot,
        selectAccount,
        signIn,
        signMessage,
        subscribe: (listener: () => void) => {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        [Symbol.dispose]: () => {
            // Invalidate any in-flight connect/signIn/silent-reconnect so they
            // bail at their generation guard instead of resuming after disposal
            // (which would re-subscribe to wallet events and re-arm cleanup that
            // this disposer already ran).
            connectGeneration++;
            unsubRegister();
            unsubUnregister();
            walletEventsCleanup?.();
            walletEventsCleanup = null;
            cancelReconnect();
            listeners.clear();
        },
    };
}
