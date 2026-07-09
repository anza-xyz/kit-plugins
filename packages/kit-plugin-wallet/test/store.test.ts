import {
    SOLANA_ERROR__WALLET__ACCOUNT_NOT_AVAILABLE,
    SOLANA_ERROR__WALLET__NOT_CONNECTED,
    SolanaError,
} from '@solana/kit';
import { isWalletStandardError } from '@wallet-standard/errors';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createWalletStore } from '../src/store';
import type { WalletStorage } from '../src/types';
import {
    connectMock,
    createMockAccount,
    createMockStorage,
    createMockUiWallet,
    createSignerMock,
    disconnectMock,
    emitWalletChange,
    lateRegisterWallet,
    registerWallet,
    registryListeners,
    signInMock,
    signMessageMock,
    unregisterWallet,
    updateRegisteredWallet,
    walletEventHandlers,
} from './_setup';

describe.skipIf(__BROWSER__)('store (SSR / non-browser)', () => {
    it('returns pending status on the server', () => {
        const store = createWalletStore({ chain: 'solana:mainnet' });
        expect(store.getState().status).toBe('pending');
        expect(store.getState().wallets).toEqual([]);
        expect(store.getState().connected).toBeNull();
    });

    it('throws for connect on server', async () => {
        const store = createWalletStore({ chain: 'solana:mainnet' });
        const mockWallet = createMockUiWallet();
        await expect(() => store.connect(mockWallet)).rejects.toThrow(
            new SolanaError(SOLANA_ERROR__WALLET__NOT_CONNECTED, { operation: 'connect' }),
        );
    });

    it('disconnect is a no-op on server', async () => {
        const store = createWalletStore({ chain: 'solana:mainnet' });
        await expect(store.disconnect()).resolves.toBeUndefined();
    });

    it('throws for signMessage on server', async () => {
        const store = createWalletStore({ chain: 'solana:mainnet' });
        await expect(() => store.signMessage(new Uint8Array())).rejects.toThrow(
            new SolanaError(SOLANA_ERROR__WALLET__NOT_CONNECTED, { operation: 'signMessage' }),
        );
    });

    it('throws for signIn on server', async () => {
        const store = createWalletStore({ chain: 'solana:mainnet' });
        const mockWallet = createMockUiWallet();
        await expect(() => store.signIn(mockWallet, {})).rejects.toThrow(
            new SolanaError(SOLANA_ERROR__WALLET__NOT_CONNECTED, { operation: 'signIn' }),
        );
    });

    it('subscribe returns unsubscribe function on server', () => {
        const store = createWalletStore({ chain: 'solana:mainnet' });
        const unsub = store.subscribe(() => {});
        expect(typeof unsub).toBe('function');
    });

    it('subscribeSigner returns unsubscribe function on server', () => {
        const store = createWalletStore({ chain: 'solana:mainnet' });
        const unsub = store.subscribeSigner(() => {});
        expect(() => unsub()).not.toThrow();
    });

    it('dispose is a noop on server', () => {
        const store = createWalletStore({ chain: 'solana:mainnet' });
        expect(() => store[Symbol.dispose]()).not.toThrow();
    });

    it('whenReady resolves immediately on server', async () => {
        const store = createWalletStore({ chain: 'solana:mainnet' });
        await expect(store.whenReady()).resolves.toBeUndefined();
    });
});

describe.skipIf(!__BROWSER__)('store (browser)', () => {
    it('starts in disconnected status when no storage/autoConnect', () => {
        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        expect(store.getState().status).toBe('disconnected');
    });

    it('discovers registered wallets', () => {
        const mockWallet = createMockUiWallet({ name: 'TestWallet' });
        registerWallet(mockWallet);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        expect(store.getState().wallets.length).toBe(1);
    });

    it('filters wallets by chain', () => {
        const wrongChain = createMockUiWallet({ chains: ['solana:devnet'], name: 'DevnetWallet' });
        registerWallet(wrongChain);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        expect(store.getState().wallets.length).toBe(0);
    });

    it('applies custom filter', () => {
        const w1 = createMockUiWallet({ name: 'Allowed' });
        const w2 = createMockUiWallet({ name: 'Blocked' });
        registerWallet(w1);
        registerWallet(w2);

        const store = createWalletStore({
            chain: 'solana:mainnet',
            filter: w => w.name === 'Allowed',
            storage: null,
        });
        expect(store.getState().wallets.length).toBe(1);
        expect(store.getState().wallets[0].name).toBe('Allowed');
    });

    it('does not notify listeners when a register event leaves the filtered wallet list unchanged', () => {
        const visible = createMockUiWallet({ name: 'Visible' });
        registerWallet(visible);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        const before = store.getState();
        const listener = vi.fn();
        store.subscribe(listener);

        // A wallet for a different chain registers — it's filtered out, so the
        // visible wallet list is unchanged. The snapshot must stay referentially
        // stable and no listener should fire.
        lateRegisterWallet(createMockUiWallet({ chains: ['solana:devnet'], name: 'OtherChain' }));

        expect(listener).not.toHaveBeenCalled();
        expect(store.getState()).toBe(before);
        expect(store.getState().wallets).toBe(before.wallets);
    });

    it('notifies listeners when a register event adds a wallet to the filtered list', () => {
        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        const listener = vi.fn();
        store.subscribe(listener);

        lateRegisterWallet(createMockUiWallet({ name: 'Appeared' }));

        expect(listener).toHaveBeenCalledOnce();
        expect(store.getState().wallets.length).toBe(1);
        expect(store.getState().wallets[0].name).toBe('Appeared');
    });

    it('disconnects when connected wallet is unregistered', async () => {
        const account = createMockAccount();
        const mockWallet = createMockUiWallet({
            accounts: [account],
            name: 'TestWallet',
        });
        registerWallet(mockWallet);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await store.connect(mockWallet);
        expect(store.getState().status).toBe('connected');

        unregisterWallet(mockWallet);

        const state = store.getState();
        expect(state.status).toBe('disconnected');
        expect(state.connected).toBeNull();
        expect(state.wallets.length).toBe(0);
    });

    it('rejects when the wallet unregisters during an in-flight connect', async () => {
        const account = createMockAccount();
        const mockWallet = createMockUiWallet({
            accounts: [account],
            name: 'TestWallet',
        });
        registerWallet(mockWallet);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });

        // Pause the wallet's connect() so we can unregister mid-flight.
        const { promise, resolve } = Promise.withResolvers<void>();
        connectMock.mockReturnValueOnce(promise);

        const connectPromise = store.connect(mockWallet);

        // The wallet unregisters while its connect prompt is open. state.connectedWallet
        // is still null at this point, so the unregister handler doesn't disconnect — it
        // only drops the wallet from the list.
        unregisterWallet(mockWallet);
        expect(store.getState().wallets.length).toBe(0);

        // The connect prompt now resolves.
        resolve();
        // The connection could not be established, so the attempt rejects rather
        // than resolving while the store is left disconnected.
        await expect(connectPromise).rejects.toThrow(
            new SolanaError(SOLANA_ERROR__WALLET__NOT_CONNECTED, { operation: 'connect' }),
        );

        // The store must not be left connected to a wallet absent from the list.
        const state = store.getState();
        expect(state.connected).toBeNull();
        expect(state.status).toBe('disconnected');
        expect(state.wallets.length).toBe(0);
    });

    it('rejects when the wallet unregisters during an in-flight signIn', async () => {
        const account = createMockAccount();
        const mockWallet = createMockUiWallet({
            accounts: [account],
            features: ['standard:connect', 'standard:events', 'solana:signIn'],
            name: 'TestWallet',
        });
        registerWallet(mockWallet);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });

        // Pause the wallet's signIn() so we can unregister mid-flight.
        const { promise, resolve } = Promise.withResolvers<unknown[]>();
        signInMock.mockReturnValueOnce(promise);

        const signInPromise = store.signIn(mockWallet, {});

        unregisterWallet(mockWallet);
        expect(store.getState().wallets.length).toBe(0);

        resolve([{ account: { address: account.address } }]);
        // signIn cannot connect to a wallet absent from the list, so it rejects
        // rather than resolving with the sign-in output while disconnected.
        await expect(signInPromise).rejects.toThrow(
            new SolanaError(SOLANA_ERROR__WALLET__NOT_CONNECTED, { operation: 'signIn' }),
        );

        const state = store.getState();
        expect(state.connected).toBeNull();
        expect(state.status).toBe('disconnected');
        expect(state.wallets.length).toBe(0);
    });

    it('connects to a wallet', async () => {
        const account = createMockAccount();
        const mockWallet = createMockUiWallet({
            accounts: [account],
            name: 'TestWallet',
        });
        registerWallet(mockWallet);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        const accounts = await store.connect(mockWallet);

        expect(accounts.length).toBe(1);
        const state = store.getState();
        expect(state.status).toBe('connected');
        expect(state.connected).not.toBeNull();
        expect(state.connected!.account.address).toBe(account.address);
        expect(connectMock).toHaveBeenCalledOnce();
    });

    it('prefers newly authorized account on connect', async () => {
        const existingAccount = createMockAccount();
        const newAccount = createMockAccount('Dv1XzYJkvnB7knw4E3E1HXyKVEoiacnZN35u1UgCbUkQ');

        // Wallet starts with one account visible before connect.
        const mockWallet = createMockUiWallet({
            accounts: [existingAccount],
            name: 'TestWallet',
        });
        registerWallet(mockWallet);

        // After connect, the wallet gains a new account.
        connectMock.mockImplementationOnce(() => {
            updateRegisteredWallet(
                createMockUiWallet({
                    accounts: [existingAccount, newAccount],
                    name: 'TestWallet',
                }),
            );
            return Promise.resolve();
        });

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await store.connect(mockWallet);

        // Should select the newly authorized account, not the pre-existing one.
        expect(store.getState().connected!.account.address).toBe(newAccount.address);
    });

    it('reflects accounts authorized during connect in the discovered-wallet list', async () => {
        // Wallet starts with no authorized accounts (the realistic pre-connect state).
        const mockWallet = createMockUiWallet({ accounts: [], name: 'TestWallet' });
        registerWallet(mockWallet);

        // Connect authorizes an account, regenerating the wallet's registry handle.
        const account = createMockAccount();
        connectMock.mockImplementationOnce(() => {
            updateRegisteredWallet(createMockUiWallet({ accounts: [account], name: 'TestWallet' }));
            return Promise.resolve();
        });

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await store.connect(mockWallet);

        // `wallets` must reflect the newly authorized account immediately — not stay
        // stale until an unrelated `standard:events change` fires. Consumers rendering
        // the wallet from `useWallets()` rely on `.accounts` to know it is connected.
        const state = store.getState();
        expect(state.connected!.wallet.accounts.length).toBe(1);
        expect(state.wallets[0].accounts.length).toBe(1);
        expect(state.wallets[0]).toBe(state.connected!.wallet);
    });

    it('transitions through connecting status', async () => {
        const account = createMockAccount();
        const mockWallet = createMockUiWallet({
            accounts: [account],
            name: 'TestWallet',
        });
        registerWallet(mockWallet);

        const { promise, resolve } = Promise.withResolvers<void>();
        connectMock.mockReturnValueOnce(promise);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        const connectPromise = store.connect(mockWallet);

        expect(store.getState().status).toBe('connecting');

        resolve();
        await connectPromise;

        expect(store.getState().status).toBe('connected');
    });

    it('connect throws when the wallet does not support standard:connect', async () => {
        const mockWallet = createMockUiWallet({ features: ['standard:events'], name: 'NoConnect' });
        registerWallet(mockWallet);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await expect(store.connect(mockWallet)).rejects.toThrow();
    });

    it('connect to an unsupported wallet leaves an existing connection intact', async () => {
        const account = createMockAccount();
        const supported = createMockUiWallet({
            accounts: [account],
            features: ['standard:connect', 'standard:events'],
            name: 'Supported',
        });
        // A wallet without standard:connect — connect cannot establish a session.
        const unsupported = createMockUiWallet({ features: ['standard:events'], name: 'NoConnect' });
        registerWallet(supported);
        registerWallet(unsupported);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await store.connect(supported);
        expect(store.getState().status).toBe('connected');

        // The feature is resolved before any state is mutated, so connecting to
        // an unsupported wallet must reject without publishing a 'connecting'
        // status or otherwise disturbing the live connection.
        const listener = vi.fn();
        store.subscribe(listener);
        await expect(store.connect(unsupported)).rejects.toThrow();

        expect(listener).not.toHaveBeenCalled();
        const state = store.getState();
        expect(state.status).toBe('connected');
        expect(state.connected!.account.address).toBe(account.address);
    });

    it('disconnects from a wallet', async () => {
        const account = createMockAccount();
        const mockWallet = createMockUiWallet({
            accounts: [account],
            features: ['standard:connect', 'standard:disconnect', 'standard:events'],
            name: 'TestWallet',
        });
        registerWallet(mockWallet);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await store.connect(mockWallet);
        await store.disconnect();

        const state = store.getState();
        expect(state.status).toBe('disconnected');
        expect(state.connected).toBeNull();
        expect(disconnectMock).toHaveBeenCalledOnce();
    });

    it('transitions through disconnecting status', async () => {
        const account = createMockAccount();
        const mockWallet = createMockUiWallet({
            accounts: [account],
            features: ['standard:connect', 'standard:disconnect', 'standard:events'],
            name: 'TestWallet',
        });
        registerWallet(mockWallet);

        const { promise, resolve } = Promise.withResolvers<void>();
        disconnectMock.mockReturnValueOnce(promise);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await store.connect(mockWallet);

        const disconnectPromise = store.disconnect();

        expect(store.getState().status).toBe('disconnecting');

        resolve();
        await disconnectPromise;

        expect(store.getState().status).toBe('disconnected');
    });

    it('disconnect is a no-op when not connected', async () => {
        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await store.disconnect();
        expect(store.getState().status).toBe('disconnected');
        expect(disconnectMock).not.toHaveBeenCalled();
    });

    it('notifies subscribers on state change', async () => {
        const account1 = createMockAccount();
        const account2 = createMockAccount('Dv1XzYJkvnB7knw4E3E1HXyKVEoiacnZN35u1UgCbUkQ');
        const mockWallet = createMockUiWallet({
            accounts: [account1, account2],
            name: 'TestWallet',
        });
        registerWallet(mockWallet);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await store.connect(mockWallet);

        const listener = vi.fn();
        store.subscribe(listener);

        // selectAccount is a single, synchronous state change.
        store.selectAccount(account2);
        expect(listener).toHaveBeenCalledOnce();
    });

    it('unsubscribe stops notifications', async () => {
        const account1 = createMockAccount();
        const account2 = createMockAccount('Dv1XzYJkvnB7knw4E3E1HXyKVEoiacnZN35u1UgCbUkQ');
        const mockWallet = createMockUiWallet({
            accounts: [account1, account2],
            name: 'TestWallet',
        });
        registerWallet(mockWallet);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await store.connect(mockWallet);

        const listener = vi.fn();
        const unsub = store.subscribe(listener);
        unsub();

        store.selectAccount(account2);
        expect(listener).not.toHaveBeenCalled();
    });

    it('selectAccount throws for an unauthorized account when not connected', () => {
        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        const account = createMockAccount();
        expect(() => store.selectAccount(account)).toThrow(
            new SolanaError(SOLANA_ERROR__WALLET__ACCOUNT_NOT_AVAILABLE, {
                account: account.address,
                operation: 'selectAccount',
            }),
        );
    });

    it('does not notify listeners when nothing changed', async () => {
        const account = createMockAccount();
        const mockWallet = createMockUiWallet({
            accounts: [account],
            name: 'TestWallet',
        });
        registerWallet(mockWallet);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await store.connect(mockWallet);

        const before = store.getState();
        const listener = vi.fn();
        store.subscribe(listener);
        // Clear calls from connect so we only observe selectAccount.
        createSignerMock.mockClear();

        // selectAccount with the same account — no state change. The signer is
        // a fresh object on every creation, so recreating it here would churn
        // the snapshot and notify listeners; the no-op guard must skip it.
        store.selectAccount(account);
        expect(listener).not.toHaveBeenCalled();
        expect(createSignerMock).not.toHaveBeenCalled();
        expect(store.getState()).toBe(before);
    });

    it('selectAccount switches accounts', async () => {
        const account1 = createMockAccount();
        const account2 = createMockAccount('Dv1XzYJkvnB7knw4E3E1HXyKVEoiacnZN35u1UgCbUkQ');
        const mockWallet = createMockUiWallet({
            accounts: [account1, account2],
            name: 'TestWallet',
        });
        registerWallet(mockWallet);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await store.connect(mockWallet);
        expect(store.getState().connected!.account.address).toBe(account1.address);

        store.selectAccount(account2);
        expect(store.getState().connected!.account.address).toBe(account2.address);
    });

    it('selectAccount uses the wallet-owned account for the selected address', async () => {
        const account1 = createMockAccount();
        const account2 = createMockAccount('Dv1XzYJkvnB7knw4E3E1HXyKVEoiacnZN35u1UgCbUkQ');
        const refreshedAccount2 = {
            ...account2,
            features: ['solana:signAndSendTransaction'] as const,
            label: 'Refreshed Account 2',
            publicKey: new Uint8Array(32).fill(2),
        };
        const staleAccount2 = {
            ...account2,
            features: [] as const,
            label: 'Stale Account 2',
            publicKey: new Uint8Array(32).fill(9),
        };
        const mockWallet = createMockUiWallet({
            accounts: [account1, account2],
            name: 'TestWallet',
        });
        registerWallet(mockWallet);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await store.connect(mockWallet);

        // Register `staleAccount2` as a real (if short-lived) handle for this
        // address before the wallet regenerates it again as `refreshedAccount2` —
        // otherwise handle-based resolution has nothing to resolve `staleAccount2`
        // against (it was never a handle the registry ever handed out).
        updateRegisteredWallet(
            createMockUiWallet({
                accounts: [account1, staleAccount2],
                name: 'TestWallet',
            }),
        );
        updateRegisteredWallet(
            createMockUiWallet({
                accounts: [account1, refreshedAccount2],
                name: 'TestWallet',
            }),
        );
        createSignerMock.mockClear();

        store.selectAccount(staleAccount2);

        const state = store.getState();
        expect(state.connected!.account).toBe(refreshedAccount2);
        expect(state.connected!.wallet.accounts[1]).toBe(refreshedAccount2);
        expect(createSignerMock).toHaveBeenCalledWith(refreshedAccount2, 'solana:mainnet');
    });

    it('selectAccount throws for account not in wallet', async () => {
        const account = createMockAccount();
        const foreignAccount = createMockAccount('Dv1XzYJkvnB7knw4E3E1HXyKVEoiacnZN35u1UgCbUkQ');
        const mockWallet = createMockUiWallet({
            accounts: [account],
            name: 'TestWallet',
        });
        registerWallet(mockWallet);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await store.connect(mockWallet);

        expect(() => store.selectAccount(foreignAccount)).toThrow('not available in wallet');
    });

    it('signMessage throws when not connected', async () => {
        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await expect(store.signMessage(new Uint8Array([1, 2, 3]))).rejects.toThrow(
            new SolanaError(SOLANA_ERROR__WALLET__NOT_CONNECTED, { operation: 'signMessage' }),
        );
    });

    it('signMessage calls the account feature directly when connected', async () => {
        const account = createMockAccount('11111111111111111111111111111111', [
            'solana:signTransaction',
            'solana:signMessage',
        ]);
        const mockWallet = createMockUiWallet({
            accounts: [account],
            features: ['standard:connect', 'standard:events', 'solana:signMessage'],
            name: 'TestWallet',
        });
        registerWallet(mockWallet);

        const expectedSignature = new Uint8Array(64).fill(42);
        signMessageMock.mockResolvedValueOnce([{ signature: expectedSignature }]);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await store.connect(mockWallet);

        const message = new Uint8Array([1, 2, 3]);
        const result = await store.signMessage(message);

        expect(signMessageMock).toHaveBeenCalledExactlyOnceWith({ account, message });
        expect(result).toBe(expectedSignature);
    });

    it('signMessage throws when wallet does not support solana:signMessage', async () => {
        const account = createMockAccount();
        // Wallet has standard:connect and standard:events but NOT solana:signMessage.
        const mockWallet = createMockUiWallet({
            accounts: [account],
            features: ['standard:connect', 'standard:events'],
            name: 'NoSignMessage',
        });
        registerWallet(mockWallet);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await store.connect(mockWallet);

        await expect(store.signMessage(new Uint8Array([1, 2, 3]))).rejects.toThrow();
    });

    it('signMessage throws a WalletStandardError when the connected account does not support solana:signMessage', async () => {
        // The wallet advertises solana:signMessage, but the active account does
        // not carry it in its own feature list. Feature support must be checked
        // at the account level, so this should surface a WalletStandardError
        // rather than being passed through to the wallet.
        const account = createMockAccount('11111111111111111111111111111111', ['solana:signTransaction']);
        const mockWallet = createMockUiWallet({
            accounts: [account],
            features: ['standard:connect', 'standard:events', 'solana:signMessage'],
            name: 'AccountWithoutSignMessage',
        });
        registerWallet(mockWallet);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await store.connect(mockWallet);

        await expect(store.signMessage(new Uint8Array([1, 2, 3]))).rejects.toSatisfy(isWalletStandardError);
        expect(signMessageMock).not.toHaveBeenCalled();
    });

    it('signIn throws when wallet does not support solana:signIn', async () => {
        const mockWallet = createMockUiWallet({ name: 'NoSignIn' });
        registerWallet(mockWallet);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        // mockWallet does not include 'solana:signIn' in features,
        // so getWalletFeature will throw.
        await expect(store.signIn(mockWallet, {})).rejects.toThrow();
    });

    it('signIn on an unsupported wallet leaves an existing connection intact', async () => {
        const account = createMockAccount();
        // The connected wallet supports connect/events but NOT solana:signIn.
        const mockWallet = createMockUiWallet({
            accounts: [account],
            features: ['standard:connect', 'standard:events'],
            name: 'TestWallet',
        });
        registerWallet(mockWallet);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await store.connect(mockWallet);
        expect(store.getState().status).toBe('connected');

        // signIn must reject because the feature is unsupported — and because
        // the feature is resolved before any state is mutated, the live
        // connection (and its status) must be untouched.
        await expect(store.signIn(mockWallet, {})).rejects.toThrow();

        const state = store.getState();
        expect(state.status).toBe('connected');
        expect(state.connected!.account.address).toBe(account.address);
    });

    it('signIn connects via SIWS and sets up connection state', async () => {
        const account = createMockAccount();
        const mockWallet = createMockUiWallet({
            accounts: [account],
            features: ['standard:connect', 'standard:events', 'solana:signIn'],
            name: 'TestWallet',
        });
        registerWallet(mockWallet);

        signInMock.mockResolvedValueOnce([{ account: { address: account.address } }]);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        const result = await store.signIn(mockWallet, { domain: 'example.com' });

        expect(signInMock).toHaveBeenCalledWith({ domain: 'example.com' });
        expect(result).toEqual({ account: { address: account.address } });
        const state = store.getState();
        expect(state.status).toBe('connected');
        expect(state.connected).not.toBeNull();
        expect(state.connected!.account.address).toBe(account.address);
    });

    it('reflects accounts authorized during signIn in the discovered-wallet list', async () => {
        // Wallet starts with no authorized accounts (the realistic pre-signIn state).
        const mockWallet = createMockUiWallet({
            accounts: [],
            features: ['standard:connect', 'standard:events', 'solana:signIn'],
            name: 'TestWallet',
        });
        registerWallet(mockWallet);

        // SIWS authorizes an account, regenerating the wallet's registry handle.
        const account = createMockAccount();
        signInMock.mockImplementationOnce(() => {
            updateRegisteredWallet(
                createMockUiWallet({
                    accounts: [account],
                    features: ['standard:connect', 'standard:events', 'solana:signIn'],
                    name: 'TestWallet',
                }),
            );
            return Promise.resolve([{ account: { address: account.address } }]);
        });

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await store.signIn(mockWallet, {});

        // `wallets` must reflect the newly authorized account immediately — not stay
        // stale until an unrelated `standard:events change` fires. Consumers rendering
        // the wallet from `useWallets()` rely on `.accounts` to know it is connected.
        const state = store.getState();
        expect(state.connected!.wallet.accounts.length).toBe(1);
        expect(state.wallets[0].accounts.length).toBe(1);
        expect(state.wallets[0]).toBe(state.connected!.wallet);
    });

    it('signIn reverts to disconnected if rejected', async () => {
        const mockWallet = createMockUiWallet({
            features: ['standard:connect', 'standard:events', 'solana:signIn'],
            name: 'TestWallet',
        });
        registerWallet(mockWallet);

        signInMock.mockRejectedValueOnce(new Error('User rejected'));

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await expect(store.signIn(mockWallet, {})).rejects.toThrow('User rejected');
        expect(store.getState().status).toBe('disconnected');
    });

    it('signIn transitions through connecting status', async () => {
        const account = createMockAccount();
        const mockWallet = createMockUiWallet({
            accounts: [account],
            features: ['standard:connect', 'standard:events', 'solana:signIn'],
            name: 'TestWallet',
        });
        registerWallet(mockWallet);

        const { promise, resolve } = Promise.withResolvers<unknown[]>();
        signInMock.mockReturnValueOnce(promise);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        const signInPromise = store.signIn(mockWallet, {});

        expect(store.getState().status).toBe('connecting');

        resolve([{ account: { address: account.address } }]);
        await signInPromise;

        expect(store.getState().status).toBe('connected');
    });

    it('signIn rejects when the signed-in account is not in the wallet', async () => {
        const account = createMockAccount();
        const mockWallet = createMockUiWallet({
            accounts: [account],
            features: ['standard:connect', 'standard:events', 'solana:signIn'],
            name: 'TestWallet',
        });
        registerWallet(mockWallet);

        // Return an account address that doesn't match any wallet account.
        signInMock.mockResolvedValueOnce([{ account: { address: 'nonexistent' } }]);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        // The wallet signed in with an account it doesn't expose — a protocol
        // violation that can't be mapped to a connection, so signIn rejects.
        await expect(store.signIn(mockWallet, {})).rejects.toThrow(
            new SolanaError(SOLANA_ERROR__WALLET__NOT_CONNECTED, { operation: 'signIn' }),
        );

        const state = store.getState();
        expect(state.status).toBe('disconnected');
        expect(state.connected).toBeNull();
    });

    it('reverts to the previous connection when signIn to another wallet is rejected', async () => {
        const account = createMockAccount();
        const wallet1 = createMockUiWallet({ accounts: [account], name: 'Wallet1' });
        const wallet2 = createMockUiWallet({
            features: ['standard:connect', 'standard:events', 'solana:signIn'],
            name: 'Wallet2',
        });
        registerWallet(wallet1);
        registerWallet(wallet2);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await store.connect(wallet1);
        expect(store.getState().status).toBe('connected');

        signInMock.mockRejectedValueOnce(new Error('User rejected'));
        await expect(store.signIn(wallet2, {})).rejects.toThrow('User rejected');

        const state = store.getState();
        expect(state.status).toBe('connected');
        expect(state.connected!.wallet.name).toBe('Wallet1');
        expect(state.connected!.account.address).toBe(account.address);
    });

    it('reverts to the previous connection when the signed-in account is not in the new wallet', async () => {
        const account = createMockAccount();
        const wallet1 = createMockUiWallet({ accounts: [account], name: 'Wallet1' });
        const wallet2 = createMockUiWallet({
            features: ['standard:connect', 'standard:events', 'solana:signIn'],
            name: 'Wallet2',
        });
        registerWallet(wallet1);
        registerWallet(wallet2);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await store.connect(wallet1);
        expect(store.getState().status).toBe('connected');

        // wallet2 reports an account that isn't among its accounts.
        signInMock.mockResolvedValueOnce([{ account: { address: 'nonexistent' } }]);
        await expect(store.signIn(wallet2, {})).rejects.toThrow(
            new SolanaError(SOLANA_ERROR__WALLET__NOT_CONNECTED, { operation: 'signIn' }),
        );

        const state = store.getState();
        expect(state.status).toBe('connected');
        expect(state.connected!.wallet.name).toBe('Wallet1');
        expect(state.connected!.account.address).toBe(account.address);
    });

    it('reverts to disconnected if connect is rejected', async () => {
        const mockWallet = createMockUiWallet({ name: 'TestWallet' });
        registerWallet(mockWallet);
        connectMock.mockRejectedValueOnce(new Error('User rejected'));

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await expect(store.connect(mockWallet)).rejects.toThrow('User rejected');
        expect(store.getState().status).toBe('disconnected');
    });

    it('reverts to the previous connection when connect to another wallet fails', async () => {
        const account = createMockAccount();
        const wallet1 = createMockUiWallet({ accounts: [account], name: 'Wallet1' });
        const wallet2 = createMockUiWallet({ name: 'Wallet2' });
        registerWallet(wallet1);
        registerWallet(wallet2);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await store.connect(wallet1);
        expect(store.getState().status).toBe('connected');

        connectMock.mockRejectedValueOnce(new Error('User rejected'));
        await expect(store.connect(wallet2)).rejects.toThrow('User rejected');

        // Declining wallet2 should leave wallet1 connected, not log the user out.
        const state = store.getState();
        expect(state.status).toBe('connected');
        expect(state.connected!.wallet.name).toBe('Wallet1');
        expect(state.connected!.account.address).toBe(account.address);
    });

    it('reverts to the previous connection when a new wallet returns zero accounts', async () => {
        const account = createMockAccount();
        const wallet1 = createMockUiWallet({ accounts: [account], name: 'Wallet1' });
        const wallet2 = createMockUiWallet({ accounts: [], name: 'Wallet2' });
        registerWallet(wallet1);
        registerWallet(wallet2);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await store.connect(wallet1);
        expect(store.getState().status).toBe('connected');

        // wallet2 authorized no accounts, so the connect attempt rejects.
        await expect(store.connect(wallet2)).rejects.toThrow(
            new SolanaError(SOLANA_ERROR__WALLET__NOT_CONNECTED, { operation: 'connect' }),
        );

        // wallet2 never established a connection, so wallet1 stays connected.
        const state = store.getState();
        expect(state.status).toBe('connected');
        expect(state.connected!.wallet.name).toBe('Wallet1');
        expect(state.connected!.account.address).toBe(account.address);
    });

    it('retains the persisted account when connect to another wallet fails', async () => {
        const account = createMockAccount();
        const wallet1 = createMockUiWallet({ accounts: [account], name: 'Wallet1' });
        const wallet2 = createMockUiWallet({ name: 'Wallet2' });
        registerWallet(wallet1);
        registerWallet(wallet2);

        const storage = createMockStorage();
        const store = createWalletStore({ autoConnect: false, chain: 'solana:mainnet', storage });
        await store.connect(wallet1);
        expect(await storage.getItem('kit-wallet')).toBe(`Wallet1:${account.address}`);

        connectMock.mockRejectedValueOnce(new Error('User rejected'));
        await expect(store.connect(wallet2)).rejects.toThrow('User rejected');

        // The persisted key for wallet1 must survive the failed connect so the
        // next page load can still silently reconnect to it.
        expect(await storage.getItem('kit-wallet')).toBe(`Wallet1:${account.address}`);
    });

    it('stale connect rejection does not disconnect the active connection', async () => {
        const account1 = createMockAccount();
        const account2 = createMockAccount('Dv1XzYJkvnB7knw4E3E1HXyKVEoiacnZN35u1UgCbUkQ');
        const wallet1 = createMockUiWallet({ accounts: [account1], name: 'Wallet1' });
        const wallet2 = createMockUiWallet({ accounts: [account2], name: 'Wallet2' });
        registerWallet(wallet1);
        registerWallet(wallet2);

        const first = Promise.withResolvers<void>();
        connectMock.mockReturnValueOnce(first.promise);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });

        // Start connecting to wallet1.
        const firstPromise = store.connect(wallet1);

        // User gives up on wallet1 and connects to wallet2 instead.
        await store.connect(wallet2);
        expect(store.getState().connected!.account.address).toBe(account2.address);

        // Wallet1 prompt is dismissed — rejection should not disconnect wallet2.
        first.reject(new Error('User rejected'));
        await expect(firstPromise).rejects.toThrow('User rejected');

        expect(store.getState().status).toBe('connected');
        expect(store.getState().connected!.account.address).toBe(account2.address);
    });

    it('stale connect rejection does not interfere with in-flight connect', async () => {
        const account1 = createMockAccount();
        const account2 = createMockAccount('Dv1XzYJkvnB7knw4E3E1HXyKVEoiacnZN35u1UgCbUkQ');
        const wallet1 = createMockUiWallet({ accounts: [account1], name: 'Wallet1' });
        const wallet2 = createMockUiWallet({ accounts: [account2], name: 'Wallet2' });
        registerWallet(wallet1);
        registerWallet(wallet2);

        const first = Promise.withResolvers<void>();
        const second = Promise.withResolvers<void>();
        connectMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });

        // Both connects are in flight.
        const firstPromise = store.connect(wallet1);
        const secondPromise = store.connect(wallet2);

        // Wallet1 is dismissed while wallet2 is still pending.
        first.reject(new Error('User rejected'));
        await expect(firstPromise).rejects.toThrow('User rejected');

        // Store should still be connecting (wallet2 is in flight).
        expect(store.getState().status).toBe('connecting');

        // Wallet2 completes — should connect normally.
        second.resolve();
        await secondPromise;

        expect(store.getState().status).toBe('connected');
        expect(store.getState().connected!.account.address).toBe(account2.address);
    });

    it('concurrent connect calls do not leak event subscriptions', async () => {
        const account1 = createMockAccount();
        const account2 = createMockAccount('Dv1XzYJkvnB7knw4E3E1HXyKVEoiacnZN35u1UgCbUkQ');
        const wallet1 = createMockUiWallet({ accounts: [account1], name: 'Wallet1' });
        const wallet2 = createMockUiWallet({ accounts: [account2], name: 'Wallet2' });
        registerWallet(wallet1);
        registerWallet(wallet2);

        const first = Promise.withResolvers<void>();
        connectMock.mockReturnValueOnce(first.promise);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });

        // Start connecting to wallet1, but don't await yet.
        const firstPromise = store.connect(wallet1);

        // Start connecting to wallet2 — this should supersede wallet1.
        const secondPromise = store.connect(wallet2);

        // Resolve the first connect — it was superseded, so it rejects with an
        // AbortError rather than applying its result.
        first.resolve();
        await expect(firstPromise).rejects.toThrow('superseded');
        await secondPromise;

        // wallet2 should be connected, not wallet1.
        expect(store.getState().status).toBe('connected');
        expect(store.getState().connected!.account.address).toBe(account2.address);
    });

    it('rejects a superseded connect with an AbortError (double-click still connects)', async () => {
        const account = createMockAccount();
        const mockWallet = createMockUiWallet({ accounts: [account], name: 'TestWallet' });
        registerWallet(mockWallet);

        const first = Promise.withResolvers<void>();
        connectMock.mockReturnValueOnce(first.promise);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });

        // Two clicks on the same wallet before the first resolves.
        const firstPromise = store.connect(mockWallet);
        const secondPromise = store.connect(mockWallet);

        first.resolve();

        // The orphaned first click rejects with a recognizable AbortError that
        // consumers ignore by convention, ...
        const error = await firstPromise.then(
            () => null,
            (e: unknown) => e,
        );
        expect(error).toBeInstanceOf(DOMException);
        expect((error as DOMException).name).toBe('AbortError');

        // ... while the second click establishes the connection.
        await secondPromise;
        expect(store.getState().status).toBe('connected');
        expect(store.getState().connected!.account.address).toBe(account.address);
    });

    it('concurrent signIn does not apply stale result', async () => {
        const account1 = createMockAccount();
        const account2 = createMockAccount('Dv1XzYJkvnB7knw4E3E1HXyKVEoiacnZN35u1UgCbUkQ');
        const wallet1 = createMockUiWallet({
            accounts: [account1],
            features: ['standard:connect', 'standard:events', 'solana:signIn'],
            name: 'Wallet1',
        });
        const wallet2 = createMockUiWallet({
            accounts: [account2],
            features: ['standard:connect', 'standard:events', 'solana:signIn'],
            name: 'Wallet2',
        });
        registerWallet(wallet1);
        registerWallet(wallet2);

        const first = Promise.withResolvers<unknown[]>();
        signInMock
            .mockReturnValueOnce(first.promise)
            .mockResolvedValueOnce([{ account: { address: account2.address } }]);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });

        // Start signIn to wallet1, but don't await yet.
        const firstPromise = store.signIn(wallet1, {});

        // Start signIn to wallet2 — this should supersede wallet1.
        const secondPromise = store.signIn(wallet2, {});

        // Resolve the first signIn — it was superseded, so it rejects with an
        // AbortError rather than applying its result.
        first.resolve([{ account: { address: account1.address } }]);
        await expect(firstPromise).rejects.toThrow('superseded');
        await secondPromise;

        // wallet2 should be connected, not wallet1.
        expect(store.getState().status).toBe('connected');
        expect(store.getState().connected!.account.address).toBe(account2.address);
    });

    it('connect supersedes in-flight signIn', async () => {
        const account1 = createMockAccount();
        const account2 = createMockAccount('Dv1XzYJkvnB7knw4E3E1HXyKVEoiacnZN35u1UgCbUkQ');
        const wallet1 = createMockUiWallet({
            accounts: [account1],
            features: ['standard:connect', 'standard:events', 'solana:signIn'],
            name: 'Wallet1',
        });
        const wallet2 = createMockUiWallet({ accounts: [account2], name: 'Wallet2' });
        registerWallet(wallet1);
        registerWallet(wallet2);

        const pendingSignIn = Promise.withResolvers<unknown[]>();
        signInMock.mockReturnValueOnce(pendingSignIn.promise);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });

        // Start signIn, then connect to a different wallet before it resolves.
        const signInPromise = store.signIn(wallet1, {});
        await store.connect(wallet2);

        // signIn resolves stale — it was superseded, so it rejects with an
        // AbortError and must not overwrite wallet2's connection.
        pendingSignIn.resolve([{ account: { address: account1.address } }]);
        await expect(signInPromise).rejects.toThrow('superseded');

        expect(store.getState().status).toBe('connected');
        expect(store.getState().connected!.account.address).toBe(account2.address);
    });

    it('explicit connect supersedes in-flight auto-reconnect', async () => {
        vi.useFakeTimers();

        const savedAccount = createMockAccount();
        const userAccount = createMockAccount('Dv1XzYJkvnB7knw4E3E1HXyKVEoiacnZN35u1UgCbUkQ');
        const savedWallet = createMockUiWallet({ accounts: [savedAccount], name: 'SavedWallet' });
        const userWallet = createMockUiWallet({ accounts: [userAccount], name: 'UserWallet' });
        registerWallet(userWallet);

        const storage = createMockStorage({ 'kit-wallet': `SavedWallet:${savedAccount.address}` });
        const store = createWalletStore({ chain: 'solana:mainnet', storage });

        await vi.advanceTimersByTimeAsync(0);
        expect(store.getState().status).toBe('reconnecting');

        // User explicitly connects while waiting for saved wallet.
        await store.connect(userWallet);
        expect(store.getState().connected!.account.address).toBe(userAccount.address);

        // Saved wallet registers late — reconnect should be stale.
        const reconnectConnect = Promise.withResolvers<void>();
        connectMock.mockReturnValueOnce(reconnectConnect.promise);
        lateRegisterWallet(savedWallet);
        reconnectConnect.resolve();
        await vi.advanceTimersByTimeAsync(0);

        // User's explicit choice should not be overridden.
        expect(store.getState().connected!.account.address).toBe(userAccount.address);

        vi.useRealTimers();
    });

    it('in-flight connect supersedes concurrent auto-reconnect via generation counter', async () => {
        vi.useFakeTimers();

        const savedAccount = createMockAccount();
        const userAccount = createMockAccount('Dv1XzYJkvnB7knw4E3E1HXyKVEoiacnZN35u1UgCbUkQ');
        const savedWallet = createMockUiWallet({ accounts: [savedAccount], name: 'SavedWallet' });
        const userWallet = createMockUiWallet({ accounts: [userAccount], name: 'UserWallet' });
        registerWallet(userWallet);

        // Hold user's connect pending so both are in flight simultaneously.
        const userConnect = Promise.withResolvers<void>();
        const reconnectConnect = Promise.withResolvers<void>();
        connectMock
            .mockReturnValueOnce(userConnect.promise) // user's connect
            .mockReturnValueOnce(reconnectConnect.promise); // auto-reconnect's silent connect

        const storage = createMockStorage({ 'kit-wallet': `SavedWallet:${savedAccount.address}` });
        const store = createWalletStore({ chain: 'solana:mainnet', storage });

        await vi.advanceTimersByTimeAsync(0);
        expect(store.getState().status).toBe('reconnecting');

        // User starts connecting — still pending.
        const userPromise = store.connect(userWallet);
        expect(store.getState().status).toBe('connecting');

        // Saved wallet registers — auto-reconnect fires while user connect is in flight.
        lateRegisterWallet(savedWallet);
        await vi.advanceTimersByTimeAsync(0);

        // Auto-reconnect resolves first — but stale, so user's connecting status holds.
        reconnectConnect.resolve();
        await vi.advanceTimersByTimeAsync(0);
        expect(store.getState().status).toBe('connecting');

        // User's connect resolves second.
        userConnect.resolve();
        await userPromise;

        // User's connect should win — it has the later generation.
        expect(store.getState().status).toBe('connected');
        expect(store.getState().connected!.account.address).toBe(userAccount.address);

        vi.useRealTimers();
    });

    it('disconnect does not clobber concurrent connect', async () => {
        const account1 = createMockAccount();
        const account2 = createMockAccount('Dv1XzYJkvnB7knw4E3E1HXyKVEoiacnZN35u1UgCbUkQ');
        const wallet1 = createMockUiWallet({
            accounts: [account1],
            features: ['standard:connect', 'standard:disconnect', 'standard:events'],
            name: 'Wallet1',
        });
        const wallet2 = createMockUiWallet({ accounts: [account2], name: 'Wallet2' });
        registerWallet(wallet1);
        registerWallet(wallet2);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await store.connect(wallet1);

        // Hold disconnect pending.
        const pendingDisconnect = Promise.withResolvers<void>();
        disconnectMock.mockReturnValueOnce(pendingDisconnect.promise);
        const disconnectPromise = store.disconnect();

        // User connects to wallet2 while disconnect is in flight.
        await store.connect(wallet2);
        expect(store.getState().connected!.account.address).toBe(account2.address);

        // Disconnect resolves — should not wipe out wallet2's connection.
        pendingDisconnect.resolve();
        await disconnectPromise;

        expect(store.getState().status).toBe('connected');
        expect(store.getState().connected!.account.address).toBe(account2.address);
    });

    it('disconnect supersedes an in-flight connect (newest action wins)', async () => {
        const account1 = createMockAccount();
        const account2 = createMockAccount('Dv1XzYJkvnB7knw4E3E1HXyKVEoiacnZN35u1UgCbUkQ');
        const wallet1 = createMockUiWallet({
            accounts: [account1],
            features: ['standard:connect', 'standard:disconnect', 'standard:events'],
            name: 'Wallet1',
        });
        const wallet2 = createMockUiWallet({ accounts: [account2], name: 'Wallet2' });
        registerWallet(wallet1);
        registerWallet(wallet2);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await store.connect(wallet1);

        // Hold a connect to wallet2 pending, then disconnect while it's in flight.
        const pendingConnect = Promise.withResolvers<void>();
        connectMock.mockReturnValueOnce(pendingConnect.promise);
        const connectPromise = store.connect(wallet2);
        const disconnectPromise = store.disconnect();
        await disconnectPromise;
        expect(store.getState().status).toBe('disconnected');

        // The superseded connect resolves last — it must not establish wallet2,
        // since disconnect was the user's later action.
        pendingConnect.resolve();
        await expect(connectPromise).rejects.toThrow('superseded');

        expect(store.getState().status).toBe('disconnected');
        expect(store.getState().connected).toBeNull();
    });

    it('selectAccount supersedes an in-flight connect (newest action wins)', async () => {
        const account1a = createMockAccount();
        const account1b = createMockAccount('Dv1XzYJkvnB7knw4E3E1HXyKVEoiacnZN35u1UgCbUkQ');
        const account2 = createMockAccount('So11111111111111111111111111111111111111112');
        const wallet1 = createMockUiWallet({
            accounts: [account1a, account1b],
            features: ['standard:connect', 'standard:disconnect', 'standard:events'],
            name: 'Wallet1',
        });
        const wallet2 = createMockUiWallet({ accounts: [account2], name: 'Wallet2' });
        registerWallet(wallet1);
        registerWallet(wallet2);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await store.connect(wallet1);
        expect(store.getState().connected!.account.address).toBe(account1a.address);

        // Hold a connect to wallet2 pending. wallet1 is still fully connected
        // while wallet2's prompt is open.
        const pendingConnect = Promise.withResolvers<void>();
        connectMock.mockReturnValueOnce(pendingConnect.promise);
        const connectPromise = store.connect(wallet2);

        // The user switches accounts on the still-connected wallet1 — a later
        // action than the in-flight connect.
        store.selectAccount(account1b);
        expect(store.getState().connected!.account.address).toBe(account1b.address);

        // The superseded connect resolves last — it must not establish wallet2
        // and overwrite the user's just-made selection.
        pendingConnect.resolve();
        await expect(connectPromise).rejects.toThrow('superseded');

        const state = store.getState();
        expect(state.connected!.wallet.name).toBe('Wallet1');
        expect(state.connected!.account.address).toBe(account1b.address);
        // The superseded connect had moved status to 'connecting'; selectAccount
        // must settle it back to 'connected' rather than leaving the store
        // stranded mid-connect when wallet1 is in fact live.
        expect(state.status).toBe('connected');
    });

    it('selectAccount restores connected status even when re-selecting the active account', async () => {
        const account1 = createMockAccount();
        const account2 = createMockAccount('Dv1XzYJkvnB7knw4E3E1HXyKVEoiacnZN35u1UgCbUkQ');
        const wallet1 = createMockUiWallet({ accounts: [account1], name: 'Wallet1' });
        const wallet2 = createMockUiWallet({ accounts: [account2], name: 'Wallet2' });
        registerWallet(wallet1);
        registerWallet(wallet2);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await store.connect(wallet1);

        // Hold a connect to wallet2 pending — status moves to 'connecting' while
        // wallet1 stays live.
        const pendingConnect = Promise.withResolvers<void>();
        connectMock.mockReturnValueOnce(pendingConnect.promise);
        const connectPromise = store.connect(wallet2);
        expect(store.getState().status).toBe('connecting');

        // Re-select the already-active account. This hits the no-op early return,
        // but must still supersede the in-flight connect and settle the status.
        store.selectAccount(account1);
        expect(store.getState().status).toBe('connected');

        pendingConnect.resolve();
        await expect(connectPromise).rejects.toThrow('superseded');

        const state = store.getState();
        expect(state.status).toBe('connected');
        expect(state.connected!.account.address).toBe(account1.address);
    });

    it('selectAccount on a wallet mid-disconnect throws and does not revive it', async () => {
        const account1 = createMockAccount();
        const account2 = createMockAccount('Dv1XzYJkvnB7knw4E3E1HXyKVEoiacnZN35u1UgCbUkQ');
        const wallet1 = createMockUiWallet({
            accounts: [account1, account2],
            features: ['standard:connect', 'standard:disconnect', 'standard:events'],
            name: 'Wallet1',
        });
        registerWallet(wallet1);

        const storage = createMockStorage();
        const store = createWalletStore({ autoConnect: false, chain: 'solana:mainnet', storage });
        await store.connect(wallet1);
        expect(await storage.getItem('kit-wallet')).toBe(`Wallet1:${account1.address}`);

        // Hold the wallet-side disconnect pending so it's in flight.
        const pendingDisconnect = Promise.withResolvers<void>();
        disconnectMock.mockReturnValueOnce(pendingDisconnect.promise);
        const disconnectPromise = store.disconnect();
        expect(store.getState().status).toBe('disconnecting');

        // Switching accounts on a wallet being torn down must reject rather than
        // supersede the disconnect, re-persist, and leave the store half-connected.
        expect(() => store.selectAccount(account2)).toThrow(
            new SolanaError(SOLANA_ERROR__WALLET__NOT_CONNECTED, { operation: 'selectAccount' }),
        );

        // The disconnect completes cleanly — the rejected selectAccount left it
        // intact, so the store ends fully disconnected with persistence cleared.
        pendingDisconnect.resolve();
        await disconnectPromise;

        expect(store.getState().status).toBe('disconnected');
        expect(store.getState().connected).toBeNull();
        expect(await storage.getItem('kit-wallet')).toBeNull();
    });

    it('a failed connect does not revive a wallet that was concurrently disconnected', async () => {
        const account1 = createMockAccount();
        const account2 = createMockAccount('Dv1XzYJkvnB7knw4E3E1HXyKVEoiacnZN35u1UgCbUkQ');
        const wallet1 = createMockUiWallet({
            accounts: [account1],
            features: ['standard:connect', 'standard:disconnect', 'standard:events'],
            name: 'Wallet1',
        });
        const wallet2 = createMockUiWallet({ accounts: [account2], name: 'Wallet2' });
        registerWallet(wallet1);
        registerWallet(wallet2);

        const storage = createMockStorage();
        const store = createWalletStore({ autoConnect: false, chain: 'solana:mainnet', storage });
        await store.connect(wallet1);
        expect(await storage.getItem('kit-wallet')).toBe(`Wallet1:${account1.address}`);

        // User disconnects wallet1; hold its wallet-side teardown pending.
        const pendingDisconnect = Promise.withResolvers<void>();
        disconnectMock.mockReturnValueOnce(pendingDisconnect.promise);
        const disconnectPromise = store.disconnect();

        // While the disconnect is in flight the user starts connecting to
        // wallet2; hold its prompt open.
        const pendingConnect = Promise.withResolvers<void>();
        connectMock.mockReturnValueOnce(pendingConnect.promise);
        const connectPromise = store.connect(wallet2);

        // Disconnect resolves — wallet1 is now disconnected at the wallet level.
        // It supersedes the connect's `finally` guard, so local state is left
        // intact on the bet that the newer connect will replace it.
        pendingDisconnect.resolve();
        await disconnectPromise;

        // The user then declines wallet2. The revert must NOT restore wallet1 —
        // the user's last completed action disconnected it.
        pendingConnect.reject(new Error('User rejected'));
        await expect(connectPromise).rejects.toThrow('User rejected');

        expect(store.getState().status).toBe('disconnected');
        expect(store.getState().connected).toBeNull();
        // Persistence for wallet1 must be cleared too, so the next load doesn't
        // silently reconnect to a wallet the user disconnected.
        expect(await storage.getItem('kit-wallet')).toBeNull();
    });

    it('a failed connect that rejects before the concurrent disconnect resolves does not revive the wallet', async () => {
        const account1 = createMockAccount();
        const account2 = createMockAccount('Dv1XzYJkvnB7knw4E3E1HXyKVEoiacnZN35u1UgCbUkQ');
        const wallet1 = createMockUiWallet({
            accounts: [account1],
            features: ['standard:connect', 'standard:disconnect', 'standard:events'],
            name: 'Wallet1',
        });
        const wallet2 = createMockUiWallet({ accounts: [account2], name: 'Wallet2' });
        registerWallet(wallet1);
        registerWallet(wallet2);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await store.connect(wallet1);

        const pendingDisconnect = Promise.withResolvers<void>();
        disconnectMock.mockReturnValueOnce(pendingDisconnect.promise);
        const disconnectPromise = store.disconnect();

        // The opposite ordering: wallet2 is declined while the disconnect is
        // still in flight. The teardown marker is set when disconnect begins, so
        // the revert still refuses to revive wallet1 even though the disconnect's
        // `finally` hasn't run yet.
        connectMock.mockRejectedValueOnce(new Error('User rejected'));
        await expect(store.connect(wallet2)).rejects.toThrow('User rejected');

        expect(store.getState().status).toBe('disconnected');
        expect(store.getState().connected).toBeNull();

        pendingDisconnect.resolve();
        await disconnectPromise;
        expect(store.getState().status).toBe('disconnected');
    });

    it('reverts to the previous connection when no disconnect was in flight', async () => {
        const account1 = createMockAccount();
        const account2 = createMockAccount('Dv1XzYJkvnB7knw4E3E1HXyKVEoiacnZN35u1UgCbUkQ');
        const wallet1 = createMockUiWallet({ accounts: [account1], name: 'Wallet1' });
        const wallet2 = createMockUiWallet({ accounts: [account2], name: 'Wallet2' });
        registerWallet(wallet1);
        registerWallet(wallet2);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await store.connect(wallet1);

        // No disconnect involved — declining wallet2 must still revert to the
        // genuinely-live wallet1 connection (guards against the marker leaking
        // across unrelated reverts).
        connectMock.mockRejectedValueOnce(new Error('User rejected'));
        await expect(store.connect(wallet2)).rejects.toThrow('User rejected');

        expect(store.getState().status).toBe('connected');
        expect(store.getState().connected!.wallet.name).toBe('Wallet1');
    });

    it('getState returns referentially stable snapshots', () => {
        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        const snap1 = store.getState();
        const snap2 = store.getState();
        expect(snap1).toBe(snap2);
    });

    it('cleanup via Symbol.dispose removes registry listeners', () => {
        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        expect(registryListeners.register.length).toBeGreaterThan(0);

        store[Symbol.dispose]();
        expect(registryListeners.register.length).toBe(0);
        expect(registryListeners.unregister.length).toBe(0);
    });

    it('subscribeSigner notifies on connect', async () => {
        const account = createMockAccount();
        const mockWallet = createMockUiWallet({ accounts: [account], name: 'TestWallet' });
        registerWallet(mockWallet);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        const listener = vi.fn();
        store.subscribeSigner(listener);

        await store.connect(mockWallet);
        expect(listener).toHaveBeenCalled();
    });

    it('subscribeSigner does not notify on a wallet-list-only change', async () => {
        const account = createMockAccount();
        const mockWallet = createMockUiWallet({ accounts: [account], name: 'TestWallet' });
        registerWallet(mockWallet);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await store.connect(mockWallet);

        const signerListener = vi.fn();
        const generalListener = vi.fn();
        store.subscribeSigner(signerListener);
        store.subscribe(generalListener);

        // An unrelated wallet registers while connected — changes `wallets` only.
        const other = createMockUiWallet({
            accounts: [createMockAccount('Dv1XzYJkvnB7knw4E3E1HXyKVEoiacnZN35u1UgCbUkQ')],
            name: 'OtherWallet',
        });
        lateRegisterWallet(other);

        expect(generalListener).toHaveBeenCalled();
        expect(signerListener).not.toHaveBeenCalled();
    });

    it('subscribeSigner does not notify on a status-only change that preserves the signer', async () => {
        const account = createMockAccount();
        const walletA = createMockUiWallet({ accounts: [account], name: 'WalletA' });
        const walletB = createMockUiWallet({
            accounts: [createMockAccount('Dv1XzYJkvnB7knw4E3E1HXyKVEoiacnZN35u1UgCbUkQ')],
            name: 'WalletB',
        });
        registerWallet(walletA);
        registerWallet(walletB);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await store.connect(walletA);

        const signerListener = vi.fn();
        const generalListener = vi.fn();
        store.subscribeSigner(signerListener);
        store.subscribe(generalListener);

        // Connecting to WalletB fails, so the store stays connected to WalletA.
        // `status` churns 'connected' → 'connecting' → 'connected' while the
        // signer is untouched: the public listener sees the status changes, but
        // the signer channel must stay silent.
        connectMock.mockRejectedValueOnce(new Error('user declined'));
        await expect(store.connect(walletB)).rejects.toThrow('user declined');

        expect(generalListener).toHaveBeenCalled();
        expect(signerListener).not.toHaveBeenCalled();
    });

    it('subscribeSigner unsubscribe stops notifications and is idempotent', async () => {
        const account = createMockAccount();
        const mockWallet = createMockUiWallet({
            accounts: [account],
            features: ['standard:connect', 'standard:disconnect', 'standard:events'],
            name: 'TestWallet',
        });
        registerWallet(mockWallet);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await store.connect(mockWallet);

        const listener = vi.fn();
        const unsub = store.subscribeSigner(listener);
        unsub();
        unsub(); // second call must be a safe no-op

        await store.disconnect();
        expect(listener).not.toHaveBeenCalled();
    });
});

// -- Abort signal tests -------------------------------------------------------

describe.skipIf(!__BROWSER__)('store action abort signals (browser)', () => {
    it('rejects connect with the signal reason and never calls the wallet when already aborted', async () => {
        const account = createMockAccount();
        const mockWallet = createMockUiWallet({ accounts: [account], name: 'TestWallet' });
        registerWallet(mockWallet);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        const controller = new AbortController();
        controller.abort(new Error('aborted by caller'));

        // The pre-abort check is the first thing connect does, so it bails before
        // moving to 'connecting' or invoking the wallet's connect feature.
        await expect(store.connect(mockWallet, { abortSignal: controller.signal })).rejects.toThrow(
            'aborted by caller',
        );
        expect(connectMock).not.toHaveBeenCalled();
        expect(store.getState().status).toBe('disconnected');
        expect(store.getState().connected).toBeNull();
    });

    it('rejects disconnect with the signal reason and leaves the connection intact when already aborted', async () => {
        const account = createMockAccount();
        const mockWallet = createMockUiWallet({
            accounts: [account],
            features: ['standard:connect', 'standard:disconnect', 'standard:events'],
            name: 'TestWallet',
        });
        registerWallet(mockWallet);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await store.connect(mockWallet);
        expect(store.getState().status).toBe('connected');

        const controller = new AbortController();
        controller.abort(new Error('aborted by caller'));

        // disconnect bails before calling the wallet's disconnect feature, so the
        // existing connection is left untouched.
        await expect(store.disconnect(undefined, { abortSignal: controller.signal })).rejects.toThrow(
            'aborted by caller',
        );
        expect(disconnectMock).not.toHaveBeenCalled();
        expect(store.getState().status).toBe('connected');
    });

    it('rejects signMessage with the signal reason and never calls the wallet when already aborted', async () => {
        const account = createMockAccount('11111111111111111111111111111111', [
            'solana:signTransaction',
            'solana:signMessage',
        ]);
        const mockWallet = createMockUiWallet({
            accounts: [account],
            features: ['standard:connect', 'standard:events', 'solana:signMessage'],
            name: 'TestWallet',
        });
        registerWallet(mockWallet);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await store.connect(mockWallet);

        const controller = new AbortController();
        controller.abort(new Error('aborted by caller'));

        await expect(store.signMessage(new Uint8Array(), { abortSignal: controller.signal })).rejects.toThrow(
            'aborted by caller',
        );
        expect(signMessageMock).not.toHaveBeenCalled();
    });

    it('rejects signIn with the signal reason and never calls the wallet when already aborted', async () => {
        const account = createMockAccount();
        const mockWallet = createMockUiWallet({
            accounts: [account],
            features: ['standard:connect', 'standard:events', 'solana:signIn'],
            name: 'TestWallet',
        });
        registerWallet(mockWallet);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        const controller = new AbortController();
        controller.abort(new Error('aborted by caller'));

        // The pre-abort check runs before signIn resolves the feature or moves to
        // 'connecting', so the wallet is never prompted.
        await expect(store.signIn(mockWallet, {}, { abortSignal: controller.signal })).rejects.toThrow(
            'aborted by caller',
        );
        expect(signInMock).not.toHaveBeenCalled();
        expect(store.getState().status).toBe('disconnected');
    });

    it('throws an AbortError by default when the signal is aborted without a reason', async () => {
        const account = createMockAccount();
        const mockWallet = createMockUiWallet({ accounts: [account], name: 'TestWallet' });
        registerWallet(mockWallet);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        const controller = new AbortController();
        controller.abort();

        // An abort with no explicit reason surfaces the default DOMException, so
        // callers can detect the cancellation via the standard AbortError name.
        const error = await store.connect(mockWallet, { abortSignal: controller.signal }).catch((e: unknown) => e);
        expect((error as DOMException).name).toBe('AbortError');
        expect(connectMock).not.toHaveBeenCalled();
    });
});

// -- Wallet event handler tests -----------------------------------------------

describe.skipIf(!__BROWSER__)('store wallet events (browser)', () => {
    async function connectToWallet(
        store: ReturnType<typeof createWalletStore>,
        wallet: ReturnType<typeof createMockUiWallet>,
    ) {
        await store.connect(wallet);
        expect(walletEventHandlers.has(wallet.name)).toBe(true);
    }

    it('disconnects when wallet no longer passes filter after feature change', async () => {
        const account = createMockAccount();
        const mockWallet = createMockUiWallet({
            accounts: [account],
            features: ['standard:connect', 'standard:events', 'solana:signTransaction'],
            name: 'TestWallet',
        });
        registerWallet(mockWallet);

        const store = createWalletStore({
            chain: 'solana:mainnet',
            filter: w => w.features.includes('solana:signTransaction'),
            storage: null,
        });
        await connectToWallet(store, mockWallet);

        // Wallet drops signTransaction — no longer passes filter.
        updateRegisteredWallet(
            createMockUiWallet({
                accounts: [account],
                features: ['standard:connect', 'standard:events'],
                name: 'TestWallet',
            }),
        );
        emitWalletChange('TestWallet', { features: true });

        const state = store.getState();
        expect(state.status).toBe('disconnected');
        expect(state.connected).toBeNull();
    });

    it('disconnects when wallet drops configured chain', async () => {
        const account = createMockAccount();
        const mockWallet = createMockUiWallet({
            accounts: [account],
            name: 'TestWallet',
        });
        registerWallet(mockWallet);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await connectToWallet(store, mockWallet);

        // Wallet drops mainnet support.
        updateRegisteredWallet(
            createMockUiWallet({
                accounts: [account],
                chains: ['solana:devnet'],
                features: ['standard:connect', 'standard:events'],
                name: 'TestWallet',
            }),
        );
        emitWalletChange('TestWallet', { chains: true });

        expect(store.getState().status).toBe('disconnected');
    });

    it('recreates the signer when the active account is regenerated on a chains change', async () => {
        const account = createMockAccount();
        const mockWallet = createMockUiWallet({
            accounts: [account],
            chains: ['solana:mainnet', 'solana:devnet'],
            name: 'TestWallet',
        });
        registerWallet(mockWallet);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await connectToWallet(store, mockWallet);

        // Clear calls from connect so we only see the event-triggered call.
        createSignerMock.mockClear();

        // The wallet narrows its chains and the registry regenerates the active
        // account (new reference, same address) while still supporting mainnet.
        const refreshedAccount = { ...account, chains: ['solana:mainnet'] as const };
        updateRegisteredWallet(
            createMockUiWallet({
                accounts: [refreshedAccount],
                chains: ['solana:mainnet'],
                name: 'TestWallet',
            }),
        );
        emitWalletChange('TestWallet', { chains: true });

        // Still connected, and the signer was recreated for the regenerated account.
        const state = store.getState();
        expect(state.status).toBe('connected');
        expect(createSignerMock).toHaveBeenCalledOnce();
        expect(createSignerMock.mock.calls[0][0]).toHaveProperty('address', account.address);
    });

    it('switches to first account when current account is removed', async () => {
        const account1 = createMockAccount();
        const account2 = createMockAccount('Dv1XzYJkvnB7knw4E3E1HXyKVEoiacnZN35u1UgCbUkQ');
        const mockWallet = createMockUiWallet({
            accounts: [account1, account2],
            name: 'TestWallet',
        });
        registerWallet(mockWallet);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await connectToWallet(store, mockWallet);
        expect(store.getState().connected!.account.address).toBe(account1.address);

        // Wallet removes account1, only account2 remains.
        updateRegisteredWallet(
            createMockUiWallet({
                accounts: [account2],
                name: 'TestWallet',
            }),
        );
        emitWalletChange('TestWallet', { accounts: true });

        const state = store.getState();
        expect(state.status).toBe('connected');
        expect(state.connected!.account.address).toBe(account2.address);
    });

    it('skips update when current account reference is unchanged', async () => {
        const account = createMockAccount();
        const mockWallet = createMockUiWallet({
            accounts: [account],
            name: 'TestWallet',
        });
        registerWallet(mockWallet);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await connectToWallet(store, mockWallet);

        const snapshotBefore = store.getState();

        // Trigger accounts change but with same account reference.
        emitWalletChange('TestWallet', { accounts: true });

        // Snapshot should be stable — no unnecessary state change.
        expect(store.getState()).toBe(snapshotBefore);
    });

    it('disconnects when all accounts are removed', async () => {
        const account = createMockAccount();
        const mockWallet = createMockUiWallet({
            accounts: [account],
            name: 'TestWallet',
        });
        registerWallet(mockWallet);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await connectToWallet(store, mockWallet);

        // Wallet removes all accounts.
        updateRegisteredWallet(
            createMockUiWallet({
                accounts: [],
                name: 'TestWallet',
            }),
        );
        emitWalletChange('TestWallet', { accounts: true });

        const state = store.getState();
        expect(state.status).toBe('disconnected');
        expect(state.connected).toBeNull();
    });

    it('stays connected and has signer after features change', async () => {
        const account = createMockAccount();
        const mockWallet = createMockUiWallet({
            accounts: [account],
            name: 'TestWallet',
        });
        registerWallet(mockWallet);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await connectToWallet(store, mockWallet);

        // Trigger feature change — store should stay connected with a valid signer.
        emitWalletChange('TestWallet', { features: true });

        const state = store.getState();
        expect(state.status).toBe('connected');
        expect(state.connected!.signer).toBeDefined();
    });

    it('does not churn the snapshot or signer on a no-op change event', async () => {
        const account = createMockAccount();
        const mockWallet = createMockUiWallet({
            accounts: [account],
            name: 'TestWallet',
        });
        registerWallet(mockWallet);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await connectToWallet(store, mockWallet);

        const before = store.getState();
        createSignerMock.mockClear();

        // A change event fires but nothing the signer depends on changed — the
        // registry returns the same account/wallet handles. The snapshot must
        // stay referentially stable and the signer must not be recreated.
        emitWalletChange('TestWallet', { features: true });

        expect(store.getState()).toBe(before);
        expect(createSignerMock).not.toHaveBeenCalled();
    });

    it('signer becomes null when the active account is regenerated without signing support', async () => {
        const account = createMockAccount();
        const mockWallet = createMockUiWallet({
            accounts: [account],
            name: 'TestWallet',
        });
        registerWallet(mockWallet);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await connectToWallet(store, mockWallet);
        expect(store.getState().connected!.signer).not.toBeNull();

        // The active account is regenerated (new reference, same address)
        // without signing features, so the bridge function now throws.
        const readOnlyAccount = { ...account, features: [] as const };
        createSignerMock.mockImplementation(() => {
            throw new Error('No signing features');
        });
        updateRegisteredWallet(
            createMockUiWallet({
                accounts: [readOnlyAccount],
                name: 'TestWallet',
            }),
        );
        emitWalletChange('TestWallet', { features: true });

        const state = store.getState();
        expect(state.status).toBe('connected');
        expect(state.connected!.signer).toBeNull();
    });
    it('uses new account signer when both accounts and features change', async () => {
        const account1 = createMockAccount();
        const account2 = createMockAccount('Dv1XzYJkvnB7knw4E3E1HXyKVEoiacnZN35u1UgCbUkQ');
        const mockWallet = createMockUiWallet({
            accounts: [account1, account2],
            name: 'TestWallet',
        });
        registerWallet(mockWallet);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await connectToWallet(store, mockWallet);

        // Clear calls from connect so we only see the event-triggered call.
        createSignerMock.mockClear();

        // Wallet removes account1 and changes features in the same event.
        updateRegisteredWallet(
            createMockUiWallet({
                accounts: [account2],
                features: ['standard:connect', 'standard:events', 'solana:signAndSendTransaction'],
                name: 'TestWallet',
            }),
        );
        emitWalletChange('TestWallet', { accounts: true, features: true });

        // Signer should be created for account2 (the new account), not account1.
        expect(store.getState().connected!.account.address).toBe(account2.address);
        expect(createSignerMock).toHaveBeenCalledOnce();
        expect(createSignerMock.mock.calls[0][0]).toHaveProperty('address', account2.address);
    });

    it('refreshes the connected wallet entry in the wallet list on a change event', async () => {
        const account = createMockAccount();
        const mockWallet = createMockUiWallet({
            accounts: [account],
            name: 'TestWallet',
        });
        registerWallet(mockWallet);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await connectToWallet(store, mockWallet);

        // The registry regenerates the wallet handle (new reference, same name)
        // — e.g. it authorized an additional account — while still passing the
        // filter.
        const account2 = createMockAccount('Dv1XzYJkvnB7knw4E3E1HXyKVEoiacnZN35u1UgCbUkQ');
        updateRegisteredWallet(
            createMockUiWallet({
                accounts: [account, account2],
                name: 'TestWallet',
            }),
        );
        emitWalletChange('TestWallet', { accounts: true });

        const state = store.getState();
        expect(state.status).toBe('connected');
        // The wallet-list entry must be the same refreshed handle as
        // connected.wallet, not the stale pre-change reference — otherwise UI
        // rendering from the list shows pre-change accounts/features.
        expect(state.wallets[0]).toBe(state.connected!.wallet);
    });

    it('drops the connected wallet from the wallet list when it no longer passes the filter', async () => {
        const account = createMockAccount();
        const mockWallet = createMockUiWallet({
            accounts: [account],
            features: ['standard:connect', 'standard:events', 'solana:signTransaction'],
            name: 'TestWallet',
        });
        registerWallet(mockWallet);

        const store = createWalletStore({
            chain: 'solana:mainnet',
            filter: w => w.features.includes('solana:signTransaction'),
            storage: null,
        });
        await connectToWallet(store, mockWallet);
        expect(store.getState().wallets.length).toBe(1);

        // Wallet drops signTransaction — it no longer passes the filter, so the
        // store disconnects.
        updateRegisteredWallet(
            createMockUiWallet({
                accounts: [account],
                features: ['standard:connect', 'standard:events'],
                name: 'TestWallet',
            }),
        );
        emitWalletChange('TestWallet', { features: true });

        const state = store.getState();
        expect(state.status).toBe('disconnected');
        // The now-ineligible wallet must be dropped immediately, not linger in
        // the list until an unrelated register/unregister event.
        expect(state.wallets.length).toBe(0);
    });
});

// -- Auto-connect tests -------------------------------------------------------

describe.skipIf(!__BROWSER__)('store auto-connect (browser)', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('auto-connects when storage has a saved wallet', async () => {
        const account = createMockAccount();
        const mockWallet = createMockUiWallet({
            accounts: [account],
            name: 'TestWallet',
        });
        registerWallet(mockWallet);

        const storage = createMockStorage({ 'kit-wallet': `TestWallet:${account.address}` });
        const store = createWalletStore({ chain: 'solana:mainnet', storage });

        expect(store.getState().status).toBe('pending');
        await vi.advanceTimersByTimeAsync(0);

        const state = store.getState();
        expect(state.status).toBe('connected');
        expect(state.connected!.account.address).toBe(account.address);
        expect(connectMock).toHaveBeenCalledWith({ silent: true });
    });

    it('reflects accounts authorized during silent reconnect in the discovered-wallet list', async () => {
        const account = createMockAccount();

        // Wallet is registered but starts with no authorized accounts (the realistic
        // state before a silent reconnect re-authorizes the saved account).
        const mockWallet = createMockUiWallet({ accounts: [], name: 'TestWallet' });
        registerWallet(mockWallet);

        // The silent reconnect re-authorizes the saved account, regenerating the
        // wallet's registry handle.
        connectMock.mockImplementationOnce(() => {
            updateRegisteredWallet(createMockUiWallet({ accounts: [account], name: 'TestWallet' }));
            return Promise.resolve();
        });

        const storage = createMockStorage({ 'kit-wallet': `TestWallet:${account.address}` });
        const store = createWalletStore({ chain: 'solana:mainnet', storage });

        await vi.advanceTimersByTimeAsync(0);

        // `wallets` must reflect the newly authorized account immediately — not stay
        // stale until an unrelated `standard:events change` fires. Consumers rendering
        // the wallet from `useWallets()` rely on `.accounts` to know it is connected.
        const state = store.getState();
        expect(state.status).toBe('connected');
        expect(state.connected!.wallet.accounts.length).toBe(1);
        expect(state.wallets[0].accounts.length).toBe(1);
        expect(state.wallets[0]).toBe(state.connected!.wallet);
    });

    it('transitions to disconnected when storage is empty', async () => {
        const storage = createMockStorage();
        const store = createWalletStore({ chain: 'solana:mainnet', storage });

        expect(store.getState().status).toBe('pending');
        await vi.advanceTimersByTimeAsync(0);

        expect(store.getState().status).toBe('disconnected');
    });

    it('clears storage and disconnects for malformed saved key', async () => {
        const storage = createMockStorage({ 'kit-wallet': 'no-separator' });
        const store = createWalletStore({ chain: 'solana:mainnet', storage });

        await vi.advanceTimersByTimeAsync(0);

        expect(store.getState().status).toBe('disconnected');
        expect(storage.getItem('kit-wallet')).toBeNull();
    });

    it('does not auto-connect when autoConnect is false', () => {
        const storage = createMockStorage({ 'kit-wallet': 'TestWallet:abc' });
        const store = createWalletStore({ autoConnect: false, chain: 'solana:mainnet', storage });

        // Should immediately be disconnected, no async.
        expect(store.getState().status).toBe('disconnected');
    });

    it('userHasSelected prevents auto-connect from overriding', async () => {
        const account1 = createMockAccount();
        const account2 = createMockAccount('Dv1XzYJkvnB7knw4E3E1HXyKVEoiacnZN35u1UgCbUkQ');
        const wallet1 = createMockUiWallet({ accounts: [account1], name: 'SavedWallet' });
        const wallet2 = createMockUiWallet({ accounts: [account2], name: 'UserWallet' });
        registerWallet(wallet1);
        registerWallet(wallet2);

        const storage = createMockStorage({ 'kit-wallet': `SavedWallet:${account1.address}` });
        const store = createWalletStore({ chain: 'solana:mainnet', storage });

        // User connects before auto-connect resolves.
        await store.connect(wallet2);
        expect(store.getState().connected!.account.address).toBe(account2.address);

        await vi.advanceTimersByTimeAsync(0);

        // Auto-connect should not override the user's choice.
        expect(store.getState().connected!.account.address).toBe(account2.address);
    });

    it('persists account on connect', async () => {
        const account = createMockAccount();
        const mockWallet = createMockUiWallet({
            accounts: [account],
            name: 'TestWallet',
        });
        registerWallet(mockWallet);

        const storage = createMockStorage();
        const store = createWalletStore({ chain: 'solana:mainnet', storage });
        await store.connect(mockWallet);

        expect(storage.getItem('kit-wallet')).toBe(`TestWallet:${account.address}`);
    });

    it('connects when persistence writes throw synchronously', async () => {
        const account = createMockAccount();
        const mockWallet = createMockUiWallet({
            accounts: [account],
            name: 'TestWallet',
        });
        registerWallet(mockWallet);

        const storage: WalletStorage = {
            getItem: () => null,
            removeItem: () => {},
            setItem: () => {
                throw new Error('storage write failed');
            },
        };
        const store = createWalletStore({ chain: 'solana:mainnet', storage });

        await expect(store.connect(mockWallet)).resolves.toHaveLength(1);
        expect(store.getState().status).toBe('connected');
        expect(store.getState().connected!.account.address).toBe(account.address);
    });

    it('does not throw at install time when accessing localStorage throws', () => {
        // Sandboxed iframes / blocked third-party storage make even *reading*
        // the `localStorage` global throw a `SecurityError`. The default storage
        // resolution must degrade to disabled persistence rather than throwing
        // out of `createWalletStore` (and the `.use(walletSigner(...))` chain).
        const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
        Object.defineProperty(globalThis, 'localStorage', {
            configurable: true,
            get() {
                throw new DOMException('The operation is insecure.', 'SecurityError');
            },
        });

        try {
            const store = createWalletStore({ chain: 'solana:mainnet' });
            expect(store.getState().status).toBe('disconnected');
        } finally {
            if (descriptor) {
                Object.defineProperty(globalThis, 'localStorage', descriptor);
            } else {
                delete (globalThis as { localStorage?: unknown }).localStorage;
            }
        }
    });

    it('clears storage on disconnect', async () => {
        const account = createMockAccount();
        const mockWallet = createMockUiWallet({
            accounts: [account],
            features: ['standard:connect', 'standard:disconnect', 'standard:events'],
            name: 'TestWallet',
        });
        registerWallet(mockWallet);

        const storage = createMockStorage();
        const store = createWalletStore({ chain: 'solana:mainnet', storage });
        await store.connect(mockWallet);
        expect(storage.getItem('kit-wallet')).not.toBeNull();

        await store.disconnect();
        expect(storage.getItem('kit-wallet')).toBeNull();
    });

    it('disconnects when persistence removal throws synchronously', async () => {
        const account = createMockAccount();
        const mockWallet = createMockUiWallet({
            accounts: [account],
            features: ['standard:connect', 'standard:disconnect', 'standard:events'],
            name: 'TestWallet',
        });
        registerWallet(mockWallet);

        const storage: WalletStorage = {
            getItem: () => null,
            removeItem: () => {
                throw new Error('storage remove failed');
            },
            setItem: () => {},
        };
        const store = createWalletStore({ chain: 'solana:mainnet', storage });
        await store.connect(mockWallet);

        await expect(store.disconnect()).resolves.toBeUndefined();
        expect(store.getState().status).toBe('disconnected');
        expect(store.getState().connected).toBeNull();
    });

    it('falls back to disconnected when silent reconnect fails', async () => {
        const account = createMockAccount();
        const mockWallet = createMockUiWallet({
            accounts: [account],
            name: 'TestWallet',
        });
        registerWallet(mockWallet);

        connectMock.mockRejectedValueOnce(new Error('Silent connect failed'));

        const storage = createMockStorage({ 'kit-wallet': `TestWallet:${account.address}` });
        const store = createWalletStore({ chain: 'solana:mainnet', storage });

        await vi.advanceTimersByTimeAsync(0);

        expect(store.getState().status).toBe('disconnected');
        expect(storage.getItem('kit-wallet')).toBeNull();
    });

    it('persists the fallback account when the saved account is gone', async () => {
        const account = createMockAccount('Dv1XzYJkvnB7knw4E3E1HXyKVEoiacnZN35u1UgCbUkQ');
        const mockWallet = createMockUiWallet({
            accounts: [account],
            name: 'TestWallet',
        });
        registerWallet(mockWallet);

        // The saved address no longer belongs to the wallet, so the reconnect
        // falls back to the first available account.
        const storage = createMockStorage({ 'kit-wallet': 'TestWallet:11111111111111111111111111111111' });
        const store = createWalletStore({ chain: 'solana:mainnet', storage });

        await vi.advanceTimersByTimeAsync(0);

        expect(store.getState().connected!.account.address).toBe(account.address);
        // The stale address must be overwritten so future loads don't repeat the
        // find-miss-fallback dance.
        expect(storage.getItem('kit-wallet')).toBe(`TestWallet:${account.address}`);
    });

    it('does not rewrite storage on a normal reconnect to the saved account', async () => {
        const account = createMockAccount();
        const mockWallet = createMockUiWallet({
            accounts: [account],
            name: 'TestWallet',
        });
        registerWallet(mockWallet);

        const storage = createMockStorage({ 'kit-wallet': `TestWallet:${account.address}` });
        const setItem = vi.spyOn(storage, 'setItem');
        const store = createWalletStore({ chain: 'solana:mainnet', storage });

        await vi.advanceTimersByTimeAsync(0);

        expect(store.getState().connected!.account.address).toBe(account.address);
        // The saved address matched, so the reconnect must not write to storage.
        expect(setItem).not.toHaveBeenCalled();
    });

    it('falls back to disconnected when storage read rejects', async () => {
        const storage: WalletStorage = {
            getItem: () => Promise.reject(new Error('storage unavailable')),
            removeItem: () => {},
            setItem: () => {},
        };

        const store = createWalletStore({ chain: 'solana:mainnet', storage });

        expect(store.getState().status).toBe('pending');
        await vi.advanceTimersByTimeAsync(0);

        expect(store.getState().status).toBe('disconnected');
    });

    it('does not reconnect when disposed mid silent reconnect', async () => {
        const account = createMockAccount();
        const mockWallet = createMockUiWallet({
            accounts: [account],
            name: 'TestWallet',
        });
        registerWallet(mockWallet);

        // Hold the silent connect open so we can dispose while it's in flight.
        let resolveConnect!: () => void;
        connectMock.mockImplementationOnce(
            () =>
                new Promise<void>(resolve => {
                    resolveConnect = resolve;
                }),
        );

        const storage = createMockStorage({ 'kit-wallet': `TestWallet:${account.address}` });
        const store = createWalletStore({ chain: 'solana:mainnet', storage });

        // Let auto-connect reach the awaited silent connect.
        await vi.advanceTimersByTimeAsync(0);
        expect(store.getState().status).toBe('reconnecting');

        // Dispose while the silent reconnect is still awaiting, then let it resolve.
        store[Symbol.dispose]();
        resolveConnect();
        await vi.advanceTimersByTimeAsync(0);

        // The resumed reconnect must not establish a connection or subscribe to
        // wallet events after disposal.
        expect(store.getState().status).not.toBe('connected');
        expect(store.getState().connected).toBeNull();
        expect(walletEventHandlers.has('TestWallet')).toBe(false);
    });

    it('does not reconnect when disposed during the auto-connect storage read', async () => {
        const account = createMockAccount();
        const mockWallet = createMockUiWallet({
            accounts: [account],
            name: 'TestWallet',
        });
        registerWallet(mockWallet);

        const storage = createMockStorage({ 'kit-wallet': `TestWallet:${account.address}` });
        const store = createWalletStore({ chain: 'solana:mainnet', storage });

        // Dispose synchronously, before the auto-connect IIFE resumes from its
        // awaited storage read — the window React StrictMode's
        // mount → cleanup → remount hits. Disposal must invalidate the in-flight
        // auto-connect even though it hasn't yet captured a connect generation.
        store[Symbol.dispose]();

        // Let the storage read resolve and the silent reconnect (if any) run.
        await vi.advanceTimersByTimeAsync(0);

        // The disposed store must not silently connect, leak a wallet-events
        // subscription, or report itself connected.
        expect(store.getState().status).not.toBe('connected');
        expect(store.getState().connected).toBeNull();
        expect(walletEventHandlers.has('TestWallet')).toBe(false);
        expect(connectMock).not.toHaveBeenCalled();
    });
});

// -- Late wallet registration tests -------------------------------------------

describe.skipIf(!__BROWSER__)('store late wallet registration (browser)', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('reconnects when saved wallet registers late', async () => {
        const account = createMockAccount();
        const storage = createMockStorage({ 'kit-wallet': `LateWallet:${account.address}` });
        const store = createWalletStore({ chain: 'solana:mainnet', storage });

        await vi.advanceTimersByTimeAsync(0);

        // Wallet not registered yet — should be reconnecting.
        expect(store.getState().status).toBe('reconnecting');

        // Wallet registers late.
        const lateWallet = createMockUiWallet({
            accounts: [account],
            name: 'LateWallet',
        });
        lateRegisterWallet(lateWallet);

        await vi.advanceTimersByTimeAsync(0);

        expect(store.getState().status).toBe('connected');
        expect(store.getState().connected!.account.address).toBe(account.address);
    });

    it('reverts to disconnected after timeout when wallet never registers', async () => {
        const storage = createMockStorage({ 'kit-wallet': 'MissingWallet:abc' });
        const store = createWalletStore({ chain: 'solana:mainnet', storage });

        await vi.advanceTimersByTimeAsync(0);
        expect(store.getState().status).toBe('reconnecting');

        await vi.advanceTimersByTimeAsync(3000);
        expect(store.getState().status).toBe('disconnected');
    });

    it('still reconnects if wallet appears after timeout', async () => {
        const account = createMockAccount();
        const storage = createMockStorage({ 'kit-wallet': `LateWallet:${account.address}` });
        const store = createWalletStore({ chain: 'solana:mainnet', storage });

        await vi.advanceTimersByTimeAsync(0);
        expect(store.getState().status).toBe('reconnecting');

        await vi.advanceTimersByTimeAsync(3000);
        expect(store.getState().status).toBe('disconnected');

        // Wallet appears after the timeout — should still silently reconnect.
        const lateWallet = createMockUiWallet({
            accounts: [account],
            name: 'LateWallet',
        });
        lateRegisterWallet(lateWallet);
        await vi.advanceTimersByTimeAsync(0);

        expect(store.getState().status).toBe('connected');
        expect(store.getState().connected!.account.address).toBe(account.address);
    });

    it('disconnect while waiting for a late-registering wallet prevents it from connecting', async () => {
        const account = createMockAccount();
        const storage = createMockStorage({ 'kit-wallet': `LateWallet:${account.address}` });
        const store = createWalletStore({ chain: 'solana:mainnet', storage });

        await vi.advanceTimersByTimeAsync(0);
        expect(store.getState().status).toBe('reconnecting');

        // User explicitly disconnects while still waiting for the saved wallet.
        await store.disconnect();
        expect(store.getState().status).toBe('disconnected');
        expect(storage.getItem('kit-wallet')).toBeNull();

        // The saved wallet registers late — it must not override the disconnect.
        const lateWallet = createMockUiWallet({ accounts: [account], name: 'LateWallet' });
        lateRegisterWallet(lateWallet);
        await vi.advanceTimersByTimeAsync(0);

        expect(store.getState().status).toBe('disconnected');
        expect(store.getState().connected).toBeNull();
        expect(connectMock).not.toHaveBeenCalled();
    });

    it('disconnect during an in-flight silent reconnect prevents it from connecting', async () => {
        const account = createMockAccount();
        const wallet = createMockUiWallet({ accounts: [account], name: 'SavedWallet' });
        registerWallet(wallet);

        // Hold the silent reconnect's connect pending so it's in flight when the
        // user disconnects.
        const reconnectConnect = Promise.withResolvers<void>();
        connectMock.mockReturnValueOnce(reconnectConnect.promise);

        const storage = createMockStorage({ 'kit-wallet': `SavedWallet:${account.address}` });
        const store = createWalletStore({ chain: 'solana:mainnet', storage });

        await vi.advanceTimersByTimeAsync(0);
        expect(store.getState().status).toBe('reconnecting');

        // User disconnects while the silent reconnect is still awaiting connect.
        await store.disconnect();
        expect(store.getState().status).toBe('disconnected');
        expect(storage.getItem('kit-wallet')).toBeNull();

        // Silent reconnect resolves — but it's stale, so it must not connect.
        reconnectConnect.resolve();
        await vi.advanceTimersByTimeAsync(0);

        expect(store.getState().status).toBe('disconnected');
        expect(store.getState().connected).toBeNull();
    });

    it('clears storage when saved wallet is registered but filtered out', async () => {
        const account = createMockAccount();
        const storage = createMockStorage({ 'kit-wallet': `FilteredWallet:${account.address}` });

        // Wallet is registered but doesn't pass the custom filter.
        const filteredWallet = createMockUiWallet({
            accounts: [account],
            name: 'FilteredWallet',
        });
        registerWallet(filteredWallet);

        const store = createWalletStore({
            chain: 'solana:mainnet',
            filter: w => w.name !== 'FilteredWallet',
            storage,
        });

        await vi.advanceTimersByTimeAsync(0);

        expect(store.getState().status).toBe('disconnected');
        expect(storage.getItem('kit-wallet')).toBeNull();
    });
});

// -- All-wallets subscription tests -------------------------------------------

describe.skipIf(!__BROWSER__)('store all-wallets subscription (browser)', () => {
    it("keeps a non-active wallet's accounts live in the discovered list", async () => {
        const aAccount = createMockAccount('11111111111111111111111111111111');
        const walletA = createMockUiWallet({ accounts: [aAccount], name: 'WalletA' });
        const walletB = createMockUiWallet({ accounts: [], name: 'WalletB' });
        registerWallet(walletA);
        registerWallet(walletB);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await store.connect(walletA);
        expect(store.getState().connected!.wallet.name).toBe('WalletA');

        // WalletB (non-active) authorizes an account and fires its change event.
        const bAccount = createMockAccount('3JF3sEqM796hk5WFqA6EtmEwJQ9quALszsfJyvXNQKy3');
        updateRegisteredWallet(createMockUiWallet({ accounts: [bAccount], name: 'WalletB' }));
        emitWalletChange('WalletB', { accounts: true });

        // Its accounts must be reflected in `wallets` without switching the active
        // connection — previously this stayed stale (no subscription for non-active).
        const state = store.getState();
        expect(state.connected!.wallet.name).toBe('WalletA');
        const b = state.wallets.find(w => w.name === 'WalletB')!;
        expect(b.accounts.length).toBe(1);
    });

    it('subscribes to wallets registered after store creation', () => {
        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        expect(store.getState().wallets.length).toBe(0);

        const account = createMockAccount();
        lateRegisterWallet(createMockUiWallet({ accounts: [account], name: 'LateWallet' }));

        // A change from the late-registered wallet is observed (it got subscribed).
        const more = createMockAccount('4Ss5JMkXAD9Z7cktFEdrqeMuT6jGMF1pVozTyPHZ6zT4');
        updateRegisteredWallet(createMockUiWallet({ accounts: [account, more], name: 'LateWallet' }));
        emitWalletChange('LateWallet', { accounts: true });
        expect(store.getState().wallets.find(w => w.name === 'LateWallet')!.accounts.length).toBe(2);
    });

    it('unsubscribes a wallet when it unregisters', () => {
        const wallet = createMockUiWallet({ accounts: [createMockAccount()], name: 'Gone' });
        registerWallet(wallet);
        createWalletStore({ chain: 'solana:mainnet', storage: null });
        expect(walletEventHandlers.has('Gone')).toBe(true);
        unregisterWallet(wallet);
        expect(walletEventHandlers.has('Gone')).toBe(false);
    });

    it('tears down all subscriptions on dispose', () => {
        registerWallet(createMockUiWallet({ accounts: [createMockAccount()], name: 'W1' }));
        registerWallet(createMockUiWallet({ accounts: [], name: 'W2' }));
        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        expect(walletEventHandlers.size).toBe(2);
        store[Symbol.dispose]();
        expect(walletEventHandlers.size).toBe(0);
    });

    it('does not notify listeners for a no-op change on a non-active wallet', async () => {
        const account = createMockAccount();
        const walletA = createMockUiWallet({ accounts: [account], name: 'WalletA' });
        const walletB = createMockUiWallet({
            accounts: [createMockAccount('5bV6jUfhDHCQVA1WfKBUnXUsboJgoKgkzkKcxr3joew5')],
            name: 'WalletB',
        });
        registerWallet(walletA);
        registerWallet(walletB);
        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await store.connect(walletA);

        const listener = vi.fn();
        store.subscribe(listener);
        // Fire a change that doesn't alter WalletB's visible set (same accounts).
        emitWalletChange('WalletB', { accounts: true });
        expect(listener).not.toHaveBeenCalled();
    });
});

describe.skipIf(!__BROWSER__)('store selectAccount cross-wallet (browser)', () => {
    it('switches the active connection to an account of another authorized wallet', async () => {
        const aAccount = createMockAccount('11111111111111111111111111111111');
        const bAccount = createMockAccount('3JF3sEqM796hk5WFqA6EtmEwJQ9quALszsfJyvXNQKy3');
        const walletA = createMockUiWallet({ accounts: [aAccount], name: 'WalletA' });
        const walletB = createMockUiWallet({ accounts: [bAccount], name: 'WalletB' });
        registerWallet(walletA);
        registerWallet(walletB);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await store.connect(walletA);
        connectMock.mockClear();

        store.selectAccount(bAccount);

        const state = store.getState();
        expect(state.connected!.wallet.name).toBe('WalletB');
        expect(state.connected!.account.address).toBe(bAccount.address);
        expect(connectMock).not.toHaveBeenCalled(); // synchronous switch, no prompt
        // WalletA stays authorized in the discovered list.
        expect(state.wallets.find(w => w.name === 'WalletA')!.accounts.length).toBe(1);
    });

    it('resolves the owning wallet by account handle, not address', async () => {
        // Same address authorized in two different wallets — distinct handles.
        const shared = '4Ss5JMkXAD9Z7cktFEdrqeMuT6jGMF1pVozTyPHZ6zT4';
        const aAccount = createMockAccount(shared);
        const bAccount = createMockAccount(shared);
        const walletA = createMockUiWallet({ accounts: [aAccount], name: 'WalletA' });
        const walletB = createMockUiWallet({ accounts: [bAccount], name: 'WalletB' });
        registerWallet(walletA);
        registerWallet(walletB);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await store.connect(walletA);

        store.selectAccount(bAccount);
        expect(store.getState().connected!.wallet.name).toBe('WalletB');
    });

    it('throws ACCOUNT_NOT_AVAILABLE for an account whose wallet is not authorized', async () => {
        const walletA = createMockUiWallet({
            accounts: [createMockAccount('11111111111111111111111111111111')],
            name: 'WalletA',
        });
        registerWallet(walletA);
        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await store.connect(walletA);

        // An account handle never registered in the store.
        const orphan = createMockAccount('5bV6jUfhDHCQVA1WfKBUnXUsboJgoKgkzkKcxr3joew5');
        expect(() => store.selectAccount(orphan)).toThrow(
            new SolanaError(SOLANA_ERROR__WALLET__ACCOUNT_NOT_AVAILABLE, {
                account: orphan.address,
                operation: 'selectAccount',
            }),
        );
    });

    it('still selects within the connected wallet', async () => {
        const a1 = createMockAccount('11111111111111111111111111111111');
        const a2 = createMockAccount('3JF3sEqM796hk5WFqA6EtmEwJQ9quALszsfJyvXNQKy3');
        const walletA = createMockUiWallet({ accounts: [a1, a2], name: 'WalletA' });
        registerWallet(walletA);
        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await store.connect(walletA);

        store.selectAccount(a2);
        expect(store.getState().connected!.account.address).toBe(a2.address);
    });

    it('adopts a connection when selecting an authorized account while disconnected', () => {
        // No prior connect: status is 'disconnected', but WalletA is discovered
        // and authorized. The old `if (!state.connectedWallet) throw NOT_CONNECTED`
        // guard is gone, so this is a valid synchronous adopt (no reconnect prompt).
        const aAccount = createMockAccount('11111111111111111111111111111111');
        const walletA = createMockUiWallet({ accounts: [aAccount], name: 'WalletA' });
        registerWallet(walletA);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        expect(store.getState().status).toBe('disconnected');

        store.selectAccount(aAccount);

        const state = store.getState();
        expect(state.status).toBe('connected');
        expect(state.connected!.wallet.name).toBe('WalletA');
        expect(state.connected!.account.address).toBe(aAccount.address);
        expect(connectMock).not.toHaveBeenCalled(); // synchronous adopt, no prompt
    });
});

describe.skipIf(!__BROWSER__)('store disconnect targeting (browser)', () => {
    it('disconnects a non-active wallet without touching the active connection', async () => {
        const aAccount = createMockAccount('11111111111111111111111111111111');
        const bAccount = createMockAccount('3JF3sEqM796hk5WFqA6EtmEwJQ9quALszsfJyvXNQKy3');
        const walletA = createMockUiWallet({
            accounts: [aAccount],
            features: ['standard:connect', 'standard:disconnect', 'standard:events'],
            name: 'WalletA',
        });
        const walletB = createMockUiWallet({
            accounts: [bAccount],
            features: ['standard:connect', 'standard:disconnect', 'standard:events'],
            name: 'WalletB',
        });
        registerWallet(walletA);
        registerWallet(walletB);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await store.connect(walletA); // A is active

        // Disconnecting B empties its accounts on the underlying wallet.
        disconnectMock.mockImplementationOnce(() => {
            updateRegisteredWallet(
                createMockUiWallet({
                    accounts: [],
                    features: ['standard:connect', 'standard:disconnect', 'standard:events'],
                    name: 'WalletB',
                }),
            );
            return Promise.resolve();
        });

        await store.disconnect(walletB);

        const state = store.getState();
        expect(disconnectMock).toHaveBeenCalledTimes(1);
        expect(state.status).toBe('connected'); // A untouched
        expect(state.connected!.wallet.name).toBe('WalletA');
        expect(state.wallets.find(w => w.name === 'WalletB')!.accounts.length).toBe(0);
    });

    it('disconnect() with no argument still disconnects the active wallet', async () => {
        const walletA = createMockUiWallet({
            accounts: [createMockAccount()],
            features: ['standard:connect', 'standard:disconnect', 'standard:events'],
            name: 'WalletA',
        });
        registerWallet(walletA);
        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await store.connect(walletA);

        await store.disconnect();
        expect(store.getState().status).toBe('disconnected');
        expect(store.getState().connected).toBeNull();
    });

    it('disconnect(activeWallet) behaves like disconnect()', async () => {
        const walletA = createMockUiWallet({
            accounts: [createMockAccount()],
            features: ['standard:connect', 'standard:disconnect', 'standard:events'],
            name: 'WalletA',
        });
        registerWallet(walletA);
        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await store.connect(walletA);
        const active = store.getState().connected!.wallet;

        await store.disconnect(active);
        expect(store.getState().status).toBe('disconnected');
        expect(store.getState().connected).toBeNull();
    });

    it('is a no-op for a non-active wallet lacking standard:disconnect', async () => {
        const walletA = createMockUiWallet({
            accounts: [createMockAccount('11111111111111111111111111111111')],
            features: ['standard:connect', 'standard:disconnect', 'standard:events'],
            name: 'WalletA',
        });
        const walletB = createMockUiWallet({
            accounts: [createMockAccount('3JF3sEqM796hk5WFqA6EtmEwJQ9quALszsfJyvXNQKy3')],
            features: ['standard:connect', 'standard:events'], // no disconnect
            name: 'WalletB',
        });
        registerWallet(walletA);
        registerWallet(walletB);
        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await store.connect(walletA);

        await store.disconnect(walletB);
        expect(disconnectMock).not.toHaveBeenCalled();
        expect(store.getState().connected!.wallet.name).toBe('WalletA');
    });

    it('does not re-subscribe wallet events when disposed during an in-flight non-active disconnect', async () => {
        const walletA = createMockUiWallet({
            accounts: [createMockAccount('11111111111111111111111111111111')],
            features: ['standard:connect', 'standard:disconnect', 'standard:events'],
            name: 'WalletA',
        });
        const walletB = createMockUiWallet({
            accounts: [createMockAccount('3JF3sEqM796hk5WFqA6EtmEwJQ9quALszsfJyvXNQKy3')],
            features: ['standard:connect', 'standard:disconnect', 'standard:events'],
            name: 'WalletB',
        });
        registerWallet(walletA);
        registerWallet(walletB);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await store.connect(walletA); // A active; both A and B subscribed
        expect(walletEventHandlers.size).toBe(2);

        // B's disconnect hangs until we resolve the gate, then empties B's accounts
        // — regenerating B's handle so the `finally`'s `reconcileWalletList` returns
        // a fresh array (which would otherwise re-run `syncWalletEventSubscriptions`).
        const gate = Promise.withResolvers<void>();
        disconnectMock.mockImplementationOnce(() =>
            gate.promise.then(() => {
                updateRegisteredWallet(
                    createMockUiWallet({
                        accounts: [],
                        features: ['standard:connect', 'standard:disconnect', 'standard:events'],
                        name: 'WalletB',
                    }),
                );
            }),
        );

        const pending = store.disconnect(walletB); // suspends at the awaited disconnect
        store[Symbol.dispose](); // dispose mid-await tears down every subscription
        expect(walletEventHandlers.size).toBe(0);

        gate.resolve();
        await pending; // finally runs — must not re-subscribe into the cleared map

        expect(walletEventHandlers.size).toBe(0);
    });

    it('rejects a targeted non-active disconnect with the signal reason and mutates nothing when already aborted', async () => {
        const aAccount = createMockAccount('11111111111111111111111111111111');
        const bAccount = createMockAccount('3JF3sEqM796hk5WFqA6EtmEwJQ9quALszsfJyvXNQKy3');
        const walletA = createMockUiWallet({
            accounts: [aAccount],
            features: ['standard:connect', 'standard:disconnect', 'standard:events'],
            name: 'WalletA',
        });
        const walletB = createMockUiWallet({
            accounts: [bAccount],
            features: ['standard:connect', 'standard:disconnect', 'standard:events'],
            name: 'WalletB',
        });
        registerWallet(walletA);
        registerWallet(walletB);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await store.connect(walletA); // A is active

        const controller = new AbortController();
        controller.abort(new Error('aborted by caller'));

        // The pre-await throwIfAborted() is the first thing disconnect does, so the
        // non-active branch bails before invoking the wallet's disconnect feature or
        // marking B as the wallet mid-disconnect.
        await expect(store.disconnect(walletB, { abortSignal: controller.signal })).rejects.toThrow(
            'aborted by caller',
        );
        expect(disconnectMock).not.toHaveBeenCalled();

        // No `disconnectingWalletName` mutation leaked: selecting into B still
        // succeeds. Had the abort fired after marking B mid-disconnect, this would
        // throw NOT_CONNECTED via selectAccount's mid-disconnect guard.
        store.selectAccount(bAccount);
        expect(store.getState().connected!.wallet.name).toBe('WalletB');
    });

    it('does not cancel a pending reconnect when disconnecting a non-active wallet', async () => {
        vi.useFakeTimers();

        const savedAccount = createMockAccount('11111111111111111111111111111111');
        const otherAccount = createMockAccount('3JF3sEqM796hk5WFqA6EtmEwJQ9quALszsfJyvXNQKy3');
        // The saved wallet is never registered, so the store stays parked in the
        // reconnect-wait path. A different wallet is authorized alongside it.
        const otherWallet = createMockUiWallet({
            accounts: [otherAccount],
            features: ['standard:connect', 'standard:disconnect', 'standard:events'],
            name: 'OtherWallet',
        });
        registerWallet(otherWallet);

        const storage = createMockStorage({ 'kit-wallet': `SavedWallet:${savedAccount.address}` });
        const store = createWalletStore({ chain: 'solana:mainnet', storage });

        await vi.advanceTimersByTimeAsync(0);
        expect(store.getState().status).toBe('reconnecting');

        // Only a no-target disconnect() cancels the pending reconnect. A targeted
        // disconnect of some other authorized wallet must leave it armed.
        await store.disconnect(otherWallet);
        expect(disconnectMock).toHaveBeenCalledTimes(1);
        expect(store.getState().status).toBe('reconnecting');

        // Prove the reconnect listener genuinely survived: the saved wallet
        // registering late still triggers the silent reconnect. Were a refactor
        // to "tidy up" by calling cancelReconnect() here, this register would go
        // unheard and the store would never leave 'reconnecting'.
        lateRegisterWallet(createMockUiWallet({ accounts: [savedAccount], name: 'SavedWallet' }));
        await vi.advanceTimersByTimeAsync(0);

        expect(store.getState().status).toBe('connected');
        expect(store.getState().connected!.wallet.name).toBe('SavedWallet');

        vi.useRealTimers();
    });

    it('selectAccount on the active account throws while that wallet is mid-disconnect', async () => {
        const aAccount = createMockAccount('11111111111111111111111111111111');
        const walletA = createMockUiWallet({
            accounts: [aAccount],
            features: ['standard:connect', 'standard:disconnect', 'standard:events'],
            name: 'WalletA',
        });
        registerWallet(walletA);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await store.connect(walletA);

        // Hold the wallet-side disconnect pending so WalletA stays marked mid-disconnect.
        const pendingDisconnect = Promise.withResolvers<void>();
        disconnectMock.mockReturnValueOnce(pendingDisconnect.promise);
        const disconnectPromise = store.disconnect(); // active disconnect
        expect(store.getState().status).toBe('disconnecting');

        // Re-selecting the very account being torn down must reject via the
        // mid-disconnect guard rather than slip through selectAccount's
        // same-account no-op fast path. This is the one selectAccount path that
        // still surfaces NOT_CONNECTED instead of ACCOUNT_NOT_AVAILABLE.
        expect(() => store.selectAccount(aAccount)).toThrow(
            new SolanaError(SOLANA_ERROR__WALLET__NOT_CONNECTED, { operation: 'selectAccount' }),
        );

        pendingDisconnect.resolve();
        await disconnectPromise;
    });

    it('selectAccount into a non-active wallet throws while that wallet is mid-disconnect', async () => {
        const aAccount = createMockAccount('11111111111111111111111111111111');
        const bAccount = createMockAccount('3JF3sEqM796hk5WFqA6EtmEwJQ9quALszsfJyvXNQKy3');
        const walletA = createMockUiWallet({
            accounts: [aAccount],
            features: ['standard:connect', 'standard:disconnect', 'standard:events'],
            name: 'WalletA',
        });
        const walletB = createMockUiWallet({
            accounts: [bAccount],
            features: ['standard:connect', 'standard:disconnect', 'standard:events'],
            name: 'WalletB',
        });
        registerWallet(walletA);
        registerWallet(walletB);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await store.connect(walletA); // A active, B authorized but non-active

        // Hold B's disconnect pending so B is marked mid-disconnect while A stays live.
        const pendingDisconnect = Promise.withResolvers<void>();
        disconnectMock.mockReturnValueOnce(pendingDisconnect.promise);
        const disconnectPromise = store.disconnect(walletB);

        // Switching into an account of the wallet being deauthorized must reject.
        // The guard keys off the owner derived from the account handle (B), not the
        // active connection (A) — so this throws even though A is what's connected.
        expect(() => store.selectAccount(bAccount)).toThrow(
            new SolanaError(SOLANA_ERROR__WALLET__NOT_CONNECTED, { operation: 'selectAccount' }),
        );

        // A was never touched by the rejected switch.
        expect(store.getState().connected!.wallet.name).toBe('WalletA');

        pendingDisconnect.resolve();
        await disconnectPromise;
    });
});

// -- whenReady tests ----------------------------------------------------------

describe.skipIf(!__BROWSER__)('store whenReady (browser)', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('resolves immediately when the status has already settled', async () => {
        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        expect(store.getState().status).toBe('disconnected');
        await expect(store.whenReady()).resolves.toBeUndefined();
    });

    it('stays pending through the warm-up, hands out a stable reference, and resolves once connected', async () => {
        const account = createMockAccount();
        const mockWallet = createMockUiWallet({ accounts: [account], name: 'TestWallet' });
        registerWallet(mockWallet);

        // Hold the silent reconnect so the store lingers in 'reconnecting'.
        const reconnect = Promise.withResolvers<void>();
        connectMock.mockReturnValueOnce(reconnect.promise);

        const storage = createMockStorage({ 'kit-wallet': `TestWallet:${account.address}` });
        const store = createWalletStore({ chain: 'solana:mainnet', storage });

        // 'pending' before the reconnect fires: not resolved, and stable across calls.
        expect(store.getState().status).toBe('pending');
        const p = store.whenReady();
        expect(store.whenReady()).toBe(p);

        await vi.advanceTimersByTimeAsync(0);
        expect(store.getState().status).toBe('reconnecting');
        // Same transient episode — still the same promise.
        expect(store.whenReady()).toBe(p);
        // If `p` were already resolved the race would pick 'ready'; it is still pending.
        await expect(Promise.race([p.then(() => 'ready'), Promise.resolve('pending')])).resolves.toBe('pending');

        // Let the reconnect complete.
        reconnect.resolve();
        await vi.advanceTimersByTimeAsync(0);
        expect(store.getState().status).toBe('connected');
        await expect(p).resolves.toBeUndefined();

        // After settling, a fresh call returns an already-resolved promise, not the old one.
        const after = store.whenReady();
        expect(after).not.toBe(p);
        await expect(after).resolves.toBeUndefined();
    });

    it('resolves when the warm-up settles to disconnected', async () => {
        const account = createMockAccount();
        const mockWallet = createMockUiWallet({ accounts: [account], name: 'TestWallet' });
        registerWallet(mockWallet);
        connectMock.mockRejectedValueOnce(new Error('Silent connect failed'));

        const storage = createMockStorage({ 'kit-wallet': `TestWallet:${account.address}` });
        const store = createWalletStore({ chain: 'solana:mainnet', storage });

        expect(store.getState().status).toBe('pending');
        const p = store.whenReady();

        await vi.advanceTimersByTimeAsync(0);
        expect(store.getState().status).toBe('disconnected');
        await expect(p).resolves.toBeUndefined();
    });

    it('resolves when the store is disposed mid warm-up, settling the status to disconnected', async () => {
        const account = createMockAccount();
        const mockWallet = createMockUiWallet({ accounts: [account], name: 'TestWallet' });
        registerWallet(mockWallet);

        // Hold the silent reconnect open so the store lingers in 'reconnecting'.
        const reconnect = Promise.withResolvers<void>();
        connectMock.mockReturnValueOnce(reconnect.promise);

        const storage = createMockStorage({ 'kit-wallet': `TestWallet:${account.address}` });
        const store = createWalletStore({ chain: 'solana:mainnet', storage });

        // Grab a pending `whenReady()` while still warming up.
        const p = store.whenReady();
        await vi.advanceTimersByTimeAsync(0);
        expect(store.getState().status).toBe('reconnecting');

        // Disposal is the warm-up's final settlement: the pending promise
        // resolves instead of hanging forever, and the status leaves the
        // transient set so `isWalletWarmingUp` and `whenReady` agree.
        store[Symbol.dispose]();
        await expect(p).resolves.toBeUndefined();
        expect(store.getState().status).toBe('disconnected');

        // Calls made after disposal resolve immediately off the settled status.
        await expect(store.whenReady()).resolves.toBeUndefined();

        // The reconnect resuming after disposal must not revive the store.
        reconnect.resolve();
        await vi.advanceTimersByTimeAsync(0);
        expect(store.getState().status).toBe('disconnected');
        expect(store.getState().connected).toBeNull();
    });

    it('leaves an already-settled status untouched on dispose', async () => {
        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await vi.advanceTimersByTimeAsync(0);
        expect(store.getState().status).toBe('disconnected');

        store[Symbol.dispose]();
        expect(store.getState().status).toBe('disconnected');
        await expect(store.whenReady()).resolves.toBeUndefined();
    });
});
