import { SOLANA_ERROR__WALLET__NOT_CONNECTED, SolanaError } from '@solana/kit';
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
    lateRegisterWallet,
    registerWallet,
    registryListeners,
    signInMock,
    signMessageMock,
    unregisterWallet,
    updateRegisteredWallet,
    walletEventHandler,
} from './_setup';

describe.skipIf(__BROWSER__)('store (SSR / non-browser)', () => {
    it('returns pending status on the server', () => {
        const store = createWalletStore({ chain: 'solana:mainnet' });
        expect(store.getState().status).toBe('pending');
        expect(store.getState().wallets).toEqual([]);
        expect(store.getState().connected).toBeNull();
    });

    it('throws for connect on server', () => {
        const store = createWalletStore({ chain: 'solana:mainnet' });
        const mockWallet = createMockUiWallet();
        expect(() => store.connect(mockWallet)).toThrow(
            new SolanaError(SOLANA_ERROR__WALLET__NOT_CONNECTED, { operation: 'connect' }),
        );
    });

    it('disconnect is a no-op on server', async () => {
        const store = createWalletStore({ chain: 'solana:mainnet' });
        await expect(store.disconnect()).resolves.toBeUndefined();
    });

    it('throws for signMessage on server', () => {
        const store = createWalletStore({ chain: 'solana:mainnet' });
        expect(() => store.signMessage(new Uint8Array())).toThrow(
            new SolanaError(SOLANA_ERROR__WALLET__NOT_CONNECTED, { operation: 'signMessage' }),
        );
    });

    it('throws for signIn on server', () => {
        const store = createWalletStore({ chain: 'solana:mainnet' });
        const mockWallet = createMockUiWallet();
        expect(() => store.signIn(mockWallet, {})).toThrow(
            new SolanaError(SOLANA_ERROR__WALLET__NOT_CONNECTED, { operation: 'signIn' }),
        );
    });

    it('subscribe returns unsubscribe function on server', () => {
        const store = createWalletStore({ chain: 'solana:mainnet' });
        const unsub = store.subscribe(() => {});
        expect(typeof unsub).toBe('function');
    });

    it('dispose is a noop on server', () => {
        const store = createWalletStore({ chain: 'solana:mainnet' });
        expect(() => store[Symbol.dispose]()).not.toThrow();
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

    it('selectAccount throws when not connected', () => {
        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        const account = createMockAccount();
        expect(() => store.selectAccount(account)).toThrow(
            new SolanaError(SOLANA_ERROR__WALLET__NOT_CONNECTED, { operation: 'selectAccount' }),
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
        await expect(store.disconnect({ abortSignal: controller.signal })).rejects.toThrow('aborted by caller');
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
        expect(walletEventHandler).not.toBeNull();
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
        walletEventHandler!({ features: true });

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
        walletEventHandler!({ chains: true });

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
        walletEventHandler!({ chains: true });

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
        walletEventHandler!({ accounts: true });

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
        walletEventHandler!({ accounts: true });

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
        walletEventHandler!({ accounts: true });

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
        walletEventHandler!({ features: true });

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
        walletEventHandler!({ features: true });

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
        walletEventHandler!({ features: true });

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
        walletEventHandler!({ accounts: true, features: true });

        // Signer should be created for account2 (the new account), not account1.
        expect(store.getState().connected!.account.address).toBe(account2.address);
        expect(createSignerMock).toHaveBeenCalledOnce();
        expect(createSignerMock.mock.calls[0][0]).toHaveProperty('address', account2.address);
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
        expect(walletEventHandler).toBeNull();
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
        expect(walletEventHandler).toBeNull();
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
