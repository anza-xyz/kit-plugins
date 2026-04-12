import { address, createClient, lamports, mainnet } from '@solana/kit';
import { litesvm } from '@solana/kit-plugin-litesvm';
import { localhostRpc, rpc } from '@solana/kit-plugin-rpc';
import { describe, expect, it, vi } from 'vitest';

import { airdrop } from '../src';

describe('airdrop', () => {
    it('provides an airdrop function that relies on RPCs', () => {
        const getSignatureStatuses = vi.fn();
        const requestAirdrop = vi.fn();
        const signatureNotifications = vi.fn();
        const client = createClient()
            .use(() => ({
                rpc: { getSignatureStatuses, requestAirdrop },
                rpcSubscriptions: { signatureNotifications },
            }))
            .use(airdrop());
        expect(client).toHaveProperty('airdrop');
        expect(typeof client.airdrop).toBe('function');
    });

    it('provides an airdrop function that relies on a LiteSVM instance', async () => {
        const svm = { airdrop: vi.fn() };
        const client = createClient()
            .use(() => ({ svm }))
            .use(airdrop());
        expect(client).toHaveProperty('airdrop');
        expect(typeof client.airdrop).toBe('function');

        const receiver = address('HQVxiMVDoV9jzG4tpoxmDZsNfWvaHXm8DGGv93Gka75v');
        const amount = lamports(1_000_000_000n);
        await client.airdrop(receiver, amount);
        expect(svm.airdrop).toHaveBeenCalledWith(receiver, amount);
    });

    it('works with an arbitrary RPC', () => {
        const client = createClient().use(rpc('https://my-rpc.com')).use(airdrop());
        expect(client).toHaveProperty('airdrop');
    });

    it('works with a localhost RPC', () => {
        const client = createClient().use(localhostRpc()).use(airdrop());
        expect(client).toHaveProperty('airdrop');
    });

    it('throws a TypeScript error with a mainnet RPC', () => {
        const client = createClient()
            .use(rpc(mainnet('https://my-rpc.com')))
            // @ts-expect-error Airdrop RPC methods are not available on mainnet.
            .use(airdrop());
        expect(client).toHaveProperty('airdrop');
    });

    if (__NODEJS__) {
        it('works with a LiteSVM instance', () => {
            const client = createClient().use(litesvm()).use(airdrop());
            expect(client).toHaveProperty('airdrop');
        });
    }
});
