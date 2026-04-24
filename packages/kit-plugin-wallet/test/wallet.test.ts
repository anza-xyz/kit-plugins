import { createClient, extendClient } from '@solana/kit';
import { describe, expect, it, vi } from 'vitest';

import { walletIdentity, walletPayer, walletSigner, walletWithoutSigner } from '../src';
import { createMockAccount, createMockUiWallet, createSignerMock, mockSigner, registerWallet } from './_setup';

describe.skipIf(!__BROWSER__)('walletWithoutSigner plugin (browser)', () => {
    it('adds wallet namespace to client', () => {
        const client = createClient().use(walletWithoutSigner({ chain: 'solana:mainnet', storage: null }));
        expect(client.wallet).toBeDefined();
        expect(client.wallet.getState().status).toBe('disconnected');
    });

    it('preserves existing client properties', () => {
        const client = createClient()
            .use(client => extendClient(client, { myField: 'hello' }))
            .use(walletWithoutSigner({ chain: 'solana:mainnet', storage: null }));
        expect(client.myField).toBe('hello');
    });

    it('cleanup via Symbol.dispose cleans up store', async () => {
        const account = createMockAccount();
        const mockWallet = createMockUiWallet({ accounts: [account], name: 'TestWallet' });
        registerWallet(mockWallet);

        const client = createClient().use(walletWithoutSigner({ chain: 'solana:mainnet', storage: null }));
        await client.wallet.connect(mockWallet);
        expect(client.wallet.getState().status).toBe('connected');

        client[Symbol.dispose]();

        // Listener should fire without errors after dispose (no-op).
        const listener = vi.fn();
        client.wallet.subscribe(listener);
        expect(listener).not.toHaveBeenCalled();
    });
});

describe.skipIf(!__BROWSER__)('walletPayer plugin (browser)', () => {
    it('payer throws when not connected', () => {
        const client = createClient().use(walletPayer({ chain: 'solana:mainnet', storage: null }));
        expect(() => client.payer).toThrow('No signing wallet connected');
    });

    it('payer returns the signer when connected', async () => {
        const account = createMockAccount();
        const mockWallet = createMockUiWallet({
            accounts: [account],
            name: 'TestWallet',
        });
        registerWallet(mockWallet);

        const client = createClient().use(walletPayer({ chain: 'solana:mainnet', storage: null }));
        await client.wallet.connect(mockWallet);

        expect(client.payer).toBe(mockSigner);
    });

    it('payer throws after disconnect', async () => {
        const account = createMockAccount();
        const mockWallet = createMockUiWallet({
            accounts: [account],
            features: ['standard:connect', 'standard:disconnect', 'standard:events'],
            name: 'TestWallet',
        });
        registerWallet(mockWallet);

        const client = createClient().use(walletPayer({ chain: 'solana:mainnet', storage: null }));
        await client.wallet.connect(mockWallet);
        expect(client.payer).toBe(mockSigner);

        await client.wallet.disconnect();
        expect(() => client.payer).toThrow('No signing wallet connected');
    });

    it('preserves existing client properties', () => {
        const client = createClient()
            .use(client => extendClient(client, { myField: 'hello' }))
            .use(walletPayer({ chain: 'solana:mainnet', storage: null }));
        expect(client.myField).toBe('hello');
    });

    it('cleanup via Symbol.dispose does not throw', async () => {
        const account = createMockAccount();
        const mockWallet = createMockUiWallet({ accounts: [account], name: 'TestWallet' });
        registerWallet(mockWallet);

        const client = createClient().use(walletPayer({ chain: 'solana:mainnet', storage: null }));
        await client.wallet.connect(mockWallet);

        expect(() => client[Symbol.dispose]()).not.toThrow();
    });
});

describe.skipIf(!__BROWSER__)('walletSigner plugin (browser)', () => {
    it('sets both payer and identity', async () => {
        const account = createMockAccount();
        const mockWallet = createMockUiWallet({
            accounts: [account],
            name: 'TestWallet',
        });
        registerWallet(mockWallet);

        const client = createClient().use(walletSigner({ chain: 'solana:mainnet', storage: null }));
        await client.wallet.connect(mockWallet);

        expect(client.payer).toBe(mockSigner);
        expect(client.identity).toBe(mockSigner);
    });

    it('both payer and identity throw when not connected', () => {
        const client = createClient().use(walletSigner({ chain: 'solana:mainnet', storage: null }));
        expect(() => client.payer).toThrow('No signing wallet connected');
        expect(() => client.identity).toThrow('No signing wallet connected');
    });
});

describe.skipIf(!__BROWSER__)('subscribeToPayer / subscribeToIdentity filtering', () => {
    it('subscribeToPayer fires only when the signer identity changes', async () => {
        const account = createMockAccount();
        const mockWallet = createMockUiWallet({
            accounts: [account],
            features: ['standard:connect', 'standard:disconnect', 'standard:events'],
            name: 'TestWallet',
        });
        registerWallet(mockWallet);

        const client = createClient().use(walletPayer({ chain: 'solana:mainnet', storage: null }));
        const listener = vi.fn();
        client.subscribeToPayer(listener);

        // Wallet discovery (registering a second wallet) must not trigger.
        registerWallet(createMockUiWallet({ name: 'OtherWallet' }));
        expect(listener).not.toHaveBeenCalled();

        // Connect flips signer from null → mockSigner.
        await client.wallet.connect(mockWallet);
        expect(listener).toHaveBeenCalledTimes(1);

        // Disconnect flips signer from mockSigner → null.
        await client.wallet.disconnect();
        expect(listener).toHaveBeenCalledTimes(2);
    });

    it('subscribeToIdentity fires only when the signer identity changes', async () => {
        const account = createMockAccount();
        const mockWallet = createMockUiWallet({
            accounts: [account],
            features: ['standard:connect', 'standard:disconnect', 'standard:events'],
            name: 'TestWallet',
        });
        registerWallet(mockWallet);

        const client = createClient().use(walletIdentity({ chain: 'solana:mainnet', storage: null }));
        const listener = vi.fn();
        client.subscribeToIdentity(listener);

        registerWallet(createMockUiWallet({ name: 'OtherWallet' }));
        expect(listener).not.toHaveBeenCalled();

        await client.wallet.connect(mockWallet);
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('walletSigner fires both subscriptions on signer change', async () => {
        const account = createMockAccount();
        const mockWallet = createMockUiWallet({
            accounts: [account],
            features: ['standard:connect', 'standard:events'],
            name: 'TestWallet',
        });
        registerWallet(mockWallet);

        const client = createClient().use(walletSigner({ chain: 'solana:mainnet', storage: null }));
        const payerListener = vi.fn();
        const identityListener = vi.fn();
        client.subscribeToPayer(payerListener);
        client.subscribeToIdentity(identityListener);

        await client.wallet.connect(mockWallet);

        expect(payerListener).toHaveBeenCalledTimes(1);
        expect(identityListener).toHaveBeenCalledTimes(1);
    });

    it('walletSigner fires both subscriptions on selectAccount', async () => {
        const account1 = createMockAccount();
        const account2 = createMockAccount('Dv1XzYJkvnB7knw4E3E1HXyKVEoiacnZN35u1UgCbUkQ');
        const mockWallet = createMockUiWallet({
            accounts: [account1, account2],
            features: ['standard:connect', 'standard:events'],
            name: 'TestWallet',
        });
        registerWallet(mockWallet);

        // Return a distinct signer reference per account so the subscription
        // filter (which compares signer identity) observes a real change.
        const signer1 = { ...mockSigner, address: account1.address };
        const signer2 = { ...mockSigner, address: account2.address };
        createSignerMock.mockImplementation((account: unknown) =>
            (account as { address: string }).address === account2.address ? signer2 : signer1,
        );

        const client = createClient().use(walletSigner({ chain: 'solana:mainnet', storage: null }));
        await client.wallet.connect(mockWallet);

        const payerListener = vi.fn();
        const identityListener = vi.fn();
        client.subscribeToPayer(payerListener);
        client.subscribeToIdentity(identityListener);

        client.wallet.selectAccount(account2);

        expect(payerListener).toHaveBeenCalledTimes(1);
        expect(identityListener).toHaveBeenCalledTimes(1);
    });

    it('unsubscribe stops further notifications', async () => {
        const account = createMockAccount();
        const mockWallet = createMockUiWallet({
            accounts: [account],
            features: ['standard:connect', 'standard:disconnect', 'standard:events'],
            name: 'TestWallet',
        });
        registerWallet(mockWallet);

        const client = createClient().use(walletPayer({ chain: 'solana:mainnet', storage: null }));
        const listener = vi.fn();
        const unsubscribe = client.subscribeToPayer(listener);

        await client.wallet.connect(mockWallet);
        expect(listener).toHaveBeenCalledTimes(1);

        unsubscribe();
        await client.wallet.disconnect();
        expect(listener).toHaveBeenCalledTimes(1);
    });
});

describe.skipIf(!__BROWSER__)('wallet plugin duplicate guard', () => {
    it('throws when using two wallet plugins on the same client', () => {
        expect(() =>
            createClient()
                .use(walletWithoutSigner({ chain: 'solana:mainnet', storage: null }))
                // @ts-expect-error — intentionally testing runtime guard for duplicate wallet plugins
                .use(walletPayer({ chain: 'solana:mainnet', storage: null })),
        ).toThrow('Only one wallet plugin can be used per client');
    });
});
