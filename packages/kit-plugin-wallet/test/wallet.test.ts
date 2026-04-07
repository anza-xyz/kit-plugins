import { createClient, extendClient } from '@solana/kit';
import { describe, expect, it, vi } from 'vitest';

import { wallet, walletAsPayer } from '../src';
import { createMockAccount, createMockUiWallet, mockSigner, registerWallet } from './_setup';

describe.skipIf(!__BROWSER__)('wallet plugin (browser)', () => {
    it('adds wallet namespace to client', () => {
        const client = createClient().use(wallet({ chain: 'solana:mainnet', storage: null }));
        expect(client.wallet).toBeDefined();
        expect(client.wallet.getState().status).toBe('disconnected');
    });

    it('preserves existing client properties', () => {
        const client = createClient()
            .use(client => extendClient(client, { myField: 'hello' }))
            .use(wallet({ chain: 'solana:mainnet', storage: null }));
        expect(client.myField).toBe('hello');
    });

    it('cleanup via Symbol.dispose cleans up store', async () => {
        const account = createMockAccount();
        const mockWallet = createMockUiWallet({ accounts: [account], name: 'TestWallet' });
        registerWallet(mockWallet);

        const client = createClient().use(wallet({ chain: 'solana:mainnet', storage: null }));
        await client.wallet.connect(mockWallet);
        expect(client.wallet.getState().status).toBe('connected');

        client[Symbol.dispose]();

        // Listener should fire without errors after dispose (no-op).
        const listener = vi.fn();
        client.wallet.subscribe(listener);
        expect(listener).not.toHaveBeenCalled();
    });
});

describe.skipIf(!__BROWSER__)('walletAsPayer plugin (browser)', () => {
    it('payer is undefined when not connected', () => {
        const client = createClient().use(walletAsPayer({ chain: 'solana:mainnet', storage: null }));
        expect(client.payer).toBeUndefined();
    });

    it('payer returns the signer when connected', async () => {
        const account = createMockAccount();
        const mockWallet = createMockUiWallet({
            accounts: [account],
            name: 'TestWallet',
        });
        registerWallet(mockWallet);

        const client = createClient().use(walletAsPayer({ chain: 'solana:mainnet', storage: null }));
        await client.wallet.connect(mockWallet);

        expect(client.payer).toBe(mockSigner);
    });

    it('payer becomes undefined after disconnect', async () => {
        const account = createMockAccount();
        const mockWallet = createMockUiWallet({
            accounts: [account],
            features: ['standard:connect', 'standard:disconnect', 'standard:events'],
            name: 'TestWallet',
        });
        registerWallet(mockWallet);

        const client = createClient().use(walletAsPayer({ chain: 'solana:mainnet', storage: null }));
        await client.wallet.connect(mockWallet);
        expect(client.payer).toBe(mockSigner);

        await client.wallet.disconnect();
        expect(client.payer).toBeUndefined();
    });

    it('preserves existing client properties', () => {
        const client = createClient()
            .use(client => extendClient(client, { myField: 'hello' }))
            .use(walletAsPayer({ chain: 'solana:mainnet', storage: null }));
        expect(client.myField).toBe('hello');
    });

    it('cleanup via Symbol.dispose does not throw', async () => {
        const account = createMockAccount();
        const mockWallet = createMockUiWallet({ accounts: [account], name: 'TestWallet' });
        registerWallet(mockWallet);

        const client = createClient().use(walletAsPayer({ chain: 'solana:mainnet', storage: null }));
        await client.wallet.connect(mockWallet);

        expect(() => client[Symbol.dispose]()).not.toThrow();
    });
});
