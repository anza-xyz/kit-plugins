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
import {
    getOrCreateUiWalletForStandardWallet_DO_NOT_USE_OR_YOU_WILL_BE_FIRED,
    getWalletForHandle_DO_NOT_USE_OR_YOU_WILL_BE_FIRED,
} from '@wallet-standard/ui-registry';

import type {
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

    if (!__BROWSER__) {
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

    function setState(updates: Partial<WalletStoreState>): void {
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
            return createSignerFromWalletAccount(account, config.chain);
        } catch {
            // Wallet doesn't support signing (e.g. read-only / watch wallet).
            return null;
        }
    }

    // -- Wallet discovery --------------------------------------------------

    const registry = getWallets();

    function filterWallet(uiWallet: UiWallet): boolean {
        const supportsChain = uiWallet.chains.includes(config.chain);
        const supportsConnect = uiWallet.features.includes(StandardConnect);
        if (!supportsChain || !supportsConnect) return false;
        return config.filter ? config.filter(uiWallet) : true;
    }

    function buildWalletList(): readonly UiWallet[] {
        return Object.freeze(
            registry
                .get()
                .map(getOrCreateUiWalletForStandardWallet_DO_NOT_USE_OR_YOU_WILL_BE_FIRED)
                .filter(filterWallet),
        );
    }

    setState({ wallets: buildWalletList() });

    // Listen for new wallets being registered
    const unsubRegister = registry.on('register', () => {
        setState({ wallets: buildWalletList() });
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
            void storage?.removeItem(storageKey);
        }

        setState(updates);
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
        setState({ account, connectedWallet: wallet, signer, status: 'connected' });
        if (options?.persist !== false) {
            persistAccount(account, wallet);
        }
    }

    function refreshUiWallet(staleUiWallet: UiWallet): UiWallet {
        const rawWallet = getWalletForHandle_DO_NOT_USE_OR_YOU_WILL_BE_FIRED(staleUiWallet);
        return getOrCreateUiWalletForStandardWallet_DO_NOT_USE_OR_YOU_WILL_BE_FIRED(rawWallet);
    }

    function subscribeToWalletEvents(uiWallet: UiWallet): () => void {
        if (!uiWallet.features.includes(StandardEvents)) {
            return () => {};
        }

        const eventsFeature = getWalletFeature(
            uiWallet,
            StandardEvents,
        ) as StandardEventsFeature[typeof StandardEvents];

        return eventsFeature.on('change', properties => {
            const refreshed = refreshUiWallet(uiWallet);

            // If the wallet no longer passes the filter, disconnect.
            if (!filterWallet(refreshed)) {
                disconnectLocally();
                return;
            }

            let updates: Partial<WalletStoreState> = { connectedWallet: refreshed };

            if (properties.accounts) {
                const result = handleAccountsChanged(refreshed);
                if (result === null) {
                    disconnectLocally();
                    return;
                }
                updates = { ...updates, ...result };
            }
            // Skip features handler when accounts also changed — the account
            // handler already creates a fresh signer for the new account.
            // Running both would compute the signer from the stale account
            // in state (setState hasn't been called yet).
            if (properties.features && !properties.accounts) {
                updates = { ...updates, ...handleFeaturesChanged() };
            }

            setState(updates);

            if (updates.account) {
                persistAccount(updates.account, refreshed);
            }
        });
    }

    function handleAccountsChanged(wallet: UiWallet): Partial<WalletStoreState> | null {
        const newAccounts = wallet.accounts;

        if (newAccounts.length === 0) return null;

        const currentAddress = state.account?.address;
        const stillPresent = currentAddress ? newAccounts.find(a => a.address === currentAddress) : null;
        const activeAccount = stillPresent ?? newAccounts[0];

        // Same reference — nothing changed for this account.
        if (activeAccount === state.account) return {};

        // Account changed (new account, or same address with updated features).
        return { account: activeAccount, signer: tryCreateSigner(activeAccount) };
    }

    function handleFeaturesChanged(): Partial<WalletStoreState> {
        // Features changed but wallet is still valid — recreate signer
        // to pick up new capabilities or drop removed ones.
        if (state.account) {
            return { signer: tryCreateSigner(state.account) };
        }
        return {};
    }

    // -- Connection lifecycle ----------------------------------------------

    async function connect(uiWallet: UiWallet): Promise<readonly UiWalletAccount[]> {
        userHasSelected = true;
        cancelReconnect();
        const generation = ++connectGeneration;
        setState({ status: 'connecting' });

        try {
            const connectFeature = getWalletFeature(
                uiWallet,
                StandardConnect,
            ) as StandardConnectFeature[typeof StandardConnect];

            // Snapshot existing accounts before connect.
            const existingAccounts = [...uiWallet.accounts];

            await connectFeature.connect();

            // A newer connect/signIn was started while we were awaiting — bail.
            if (generation !== connectGeneration) return [];

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

    async function disconnect(): Promise<void> {
        if (!state.connectedWallet) return;

        const currentWallet = state.connectedWallet;
        const generation = connectGeneration;
        setState({ status: 'disconnecting' });

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

        setState({
            account: null,
            connectedWallet: null,
            signer: null,
            status: 'disconnected',
        });

        void storage?.removeItem(storageKey);
    }

    function selectAccount(account: UiWalletAccount): void {
        if (!state.connectedWallet) {
            throw new SolanaError(SOLANA_ERROR__WALLET__NOT_CONNECTED, { operation: 'selectAccount' });
        }
        const refreshed = refreshUiWallet(state.connectedWallet);
        if (!refreshed.accounts.some(a => a.address === account.address)) {
            throw new Error(`Account ${account.address} is not available in wallet "${state.connectedWallet.name}"`);
        }
        userHasSelected = true;
        const signer = tryCreateSigner(account);
        setState({ account, signer });
        persistAccount(account, state.connectedWallet);
    }

    // -- Message signing ---------------------------------------------------

    async function signMessage(message: Uint8Array): Promise<SignatureBytes> {
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

    async function signIn(uiWallet: UiWallet, input: SolanaSignInInput): Promise<SolanaSignInOutput> {
        userHasSelected = true;
        cancelReconnect();
        const generation = ++connectGeneration;
        setState({ status: 'connecting' });

        try {
            // getWalletFeature throws WalletStandardError if not supported.
            const signInFeature = getWalletFeature(uiWallet, SolanaSignIn) as SolanaSignInFeature[typeof SolanaSignIn];
            const [result] = await signInFeature.signIn(input);

            // A newer connect/signIn was started while we were awaiting — bail.
            if (generation !== connectGeneration) return result;

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

    function persistAccount(account: UiWalletAccount, wallet: UiWallet): void {
        void storage?.setItem(storageKey, `${wallet.name}:${account.address}`);
    }

    // -- Auto-connect ------------------------------------------------------

    if (config.autoConnect !== false && storage) {
        (async () => {
            const savedKey = await storage.getItem(storageKey);
            // Don't auto-connect if the user has selected a wallet
            if (userHasSelected) return;

            if (!savedKey) {
                setState({ status: 'disconnected' });
                return;
            }

            const separatorIndex = savedKey.lastIndexOf(':');
            if (separatorIndex === -1) {
                // Malformed saved key.
                setState({ status: 'disconnected' });
                await storage.removeItem(storageKey);
                return;
            }

            const walletName = savedKey.slice(0, separatorIndex);
            const savedAddress = savedKey.slice(separatorIndex + 1);
            const existing = state.wallets.find(w => w.name === walletName);

            if (existing) {
                await attemptSilentReconnect(savedAddress, existing);
            } else if (
                registry.get().some(w => {
                    const ui = getOrCreateUiWalletForStandardWallet_DO_NOT_USE_OR_YOU_WILL_BE_FIRED(w);
                    return ui.name === walletName;
                })
            ) {
                // Wallet registered but doesn't pass the filter.
                setState({ status: 'disconnected' });
                await storage.removeItem(storageKey);
            } else {
                // Wallet not registered yet — wait for it to appear.
                setState({ status: 'reconnecting' });

                // Change state to disconnected after 3s
                // Note that the listener stays alive until reconnect is cancelled, so this is
                // just affecting how long the UI shows reconnecting
                const statusTimeout = setTimeout(() => {
                    if (!userHasSelected && state.status === 'reconnecting') {
                        setState({ status: 'disconnected' });
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
                                    const ui = getOrCreateUiWalletForStandardWallet_DO_NOT_USE_OR_YOU_WILL_BE_FIRED(w);
                                    return ui.name === walletName;
                                })
                            ) {
                                // Wallet registered but filtered out.
                                clearTimeout(statusTimeout);
                                unsubRegisterForReconnect();
                                reconnectCleanup = null;
                                setState({ status: 'disconnected' });
                                await storage.removeItem(storageKey);
                            }
                        })().catch(() => {
                            // Reconnect failed — fall back to disconnected.
                            setState({ status: 'disconnected' });
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
                setState({ status: 'disconnected' });
            }
        });
    } else {
        // No auto-connect: immediately transition from 'pending' to 'disconnected'.
        setState({ status: 'disconnected' });
    }

    async function attemptSilentReconnect(savedAddress: string, uiWallet: UiWallet): Promise<void> {
        const generation = ++connectGeneration;
        setState({ status: 'reconnecting' });

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
                setState({ status: 'disconnected' });
                await storage?.removeItem(storageKey);
                return;
            }

            // Restore the specific saved account, fall back to first from same wallet.
            const activeAccount = allAccounts.find(a => a.address === savedAddress) ?? allAccounts[0];

            setConnected(activeAccount, refreshedWallet, { persist: false });
        } catch {
            if (generation === connectGeneration) {
                setState({ status: 'disconnected' });
                await storage?.removeItem(storageKey);
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
            unsubRegister();
            unsubUnregister();
            walletEventsCleanup?.();
            walletEventsCleanup = null;
            cancelReconnect();
            listeners.clear();
        },
    };
}
