import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createWalletStore } from '../src/store';
import type { WalletStorage } from '../src/types';
import { WalletNotConnectedError } from '../src/types';
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

    it('throws WalletNotConnectedError for connect on server', () => {
        const store = createWalletStore({ chain: 'solana:mainnet' });
        const mockWallet = createMockUiWallet();
        expect(() => store.connect(mockWallet)).toThrow(WalletNotConnectedError);
    });

    it('disconnect is a no-op on server', async () => {
        const store = createWalletStore({ chain: 'solana:mainnet' });
        await expect(store.disconnect()).resolves.toBeUndefined();
    });

    it('throws WalletNotConnectedError for signMessage on server', () => {
        const store = createWalletStore({ chain: 'solana:mainnet' });
        expect(() => store.signMessage(new Uint8Array())).toThrow(WalletNotConnectedError);
    });

    it('throws WalletNotConnectedError for signIn on server', () => {
        const store = createWalletStore({ chain: 'solana:mainnet' });
        const mockWallet = createMockUiWallet();
        expect(() => store.signIn(mockWallet, {})).toThrow(WalletNotConnectedError);
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
        const account = createMockAccount();
        const mockWallet = createMockUiWallet({
            accounts: [account],
            name: 'TestWallet',
        });
        registerWallet(mockWallet);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await store.connect(mockWallet);

        const listener = vi.fn();
        store.subscribe(listener);

        // selectAccount is a single, synchronous state change.
        const account2 = createMockAccount('Dv1XzYJkvnB7knw4E3E1HXyKVEoiacnZN35u1UgCbUkQ');
        store.selectAccount(account2);
        expect(listener).toHaveBeenCalledOnce();
    });

    it('unsubscribe stops notifications', async () => {
        const account = createMockAccount();
        const mockWallet = createMockUiWallet({
            accounts: [account],
            name: 'TestWallet',
        });
        registerWallet(mockWallet);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await store.connect(mockWallet);

        const listener = vi.fn();
        const unsub = store.subscribe(listener);
        unsub();

        const account2 = createMockAccount('Dv1XzYJkvnB7knw4E3E1HXyKVEoiacnZN35u1UgCbUkQ');
        store.selectAccount(account2);
        expect(listener).not.toHaveBeenCalled();
    });

    it('selectAccount throws when not connected', () => {
        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        const account = createMockAccount();
        expect(() => store.selectAccount(account)).toThrow(WalletNotConnectedError);
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

        const listener = vi.fn();
        store.subscribe(listener);

        // selectAccount with the same account — no state change.
        store.selectAccount(account);
        expect(listener).not.toHaveBeenCalled();
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

    it('signMessage throws when not connected', async () => {
        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await expect(store.signMessage(new Uint8Array([1, 2, 3]))).rejects.toThrow(WalletNotConnectedError);
    });

    it('signMessage calls wallet feature directly when connected', async () => {
        const account = createMockAccount();
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

    it('signIn throws when wallet does not support solana:signIn', async () => {
        const mockWallet = createMockUiWallet({ name: 'NoSignIn' });
        registerWallet(mockWallet);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        // mockWallet does not include 'solana:signIn' in features,
        // so getWalletFeature will throw.
        await expect(store.signIn(mockWallet, {})).rejects.toThrow();
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

    it('signIn disconnects when signed-in account is not in wallet', async () => {
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
        const result = await store.signIn(mockWallet, {});

        // Should still return the result, but not establish connection.
        expect(result).toEqual({ account: { address: 'nonexistent' } });
        const state = store.getState();
        expect(state.status).toBe('disconnected');
        expect(state.connected).toBeNull();
    });

    it('reverts to disconnected if connect is rejected', async () => {
        const mockWallet = createMockUiWallet({ name: 'TestWallet' });
        registerWallet(mockWallet);
        connectMock.mockRejectedValueOnce(new Error('User rejected'));

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await expect(store.connect(mockWallet)).rejects.toThrow('User rejected');
        expect(store.getState().status).toBe('disconnected');
    });

    it('clears previous connection when connect fails', async () => {
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

        // Previous connection should be fully cleared.
        expect(store.getState().status).toBe('disconnected');
        expect(store.getState().connected).toBeNull();
    });

    it('clears previous connection when new wallet returns zero accounts', async () => {
        const account = createMockAccount();
        const wallet1 = createMockUiWallet({ accounts: [account], name: 'Wallet1' });
        const wallet2 = createMockUiWallet({ accounts: [], name: 'Wallet2' });
        registerWallet(wallet1);
        registerWallet(wallet2);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await store.connect(wallet1);
        expect(store.getState().status).toBe('connected');

        await store.connect(wallet2);

        expect(store.getState().status).toBe('disconnected');
        expect(store.getState().connected).toBeNull();
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

        // Resolve the first connect — it should be stale and bail.
        first.resolve();
        await firstPromise;
        await secondPromise;

        // wallet2 should be connected, not wallet1.
        expect(store.getState().status).toBe('connected');
        expect(store.getState().connected!.account.address).toBe(account2.address);
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

        // Resolve the first signIn — it should be stale and bail.
        first.resolve([{ account: { address: account1.address } }]);
        await firstPromise;
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

        // signIn resolves stale — should not overwrite wallet2's connection.
        pendingSignIn.resolve([{ account: { address: account1.address } }]);
        await signInPromise;

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

    it('signer becomes null after features change when signing is dropped', async () => {
        const account = createMockAccount();
        const mockWallet = createMockUiWallet({
            accounts: [account],
            name: 'TestWallet',
        });
        registerWallet(mockWallet);

        const store = createWalletStore({ chain: 'solana:mainnet', storage: null });
        await connectToWallet(store, mockWallet);
        expect(store.getState().connected!.signer).not.toBeNull();

        // Wallet drops signing support — bridge function throws.
        createSignerMock.mockImplementation(() => {
            throw new Error('No signing features');
        });
        walletEventHandler!({ features: true });

        const state = store.getState();
        expect(state.status).toBe('connected');
        expect(state.connected!.signer).toBeNull();
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
