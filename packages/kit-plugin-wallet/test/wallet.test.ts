import { createClient, extendClient } from '@solana/kit';
import { describe, expect, it, vi } from 'vitest';

import { walletPayer, walletSigner, walletWithoutSigner } from '../src';
import { createMockAccount, createMockUiWallet, mockSigner, registerWallet } from './_setup';

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
