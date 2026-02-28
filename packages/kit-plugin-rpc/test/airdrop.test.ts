import { createEmptyClient, mainnet } from '@solana/kit';
import { describe, expect, it, vi } from 'vitest';

import { localhostRpc, rpc, rpcAirdrop } from '../src';

describe('rpcAirdrop', () => {
    it('provides an airdrop function that relies on RPCs', () => {
        const getSignatureStatuses = vi.fn();
        const requestAirdrop = vi.fn();
        const signatureNotifications = vi.fn();
        const client = createEmptyClient()
            .use(() => ({
                rpc: { getSignatureStatuses, requestAirdrop },
                rpcSubscriptions: { signatureNotifications },
            }))
            .use(rpcAirdrop());
        expect(client).toHaveProperty('airdrop');
        expect(client.airdrop).toBeTypeOf('function');
    });

    it('works with an arbitrary RPC', () => {
        const client = createEmptyClient().use(rpc('https://my-rpc.com')).use(rpcAirdrop());
        expect(client).toHaveProperty('airdrop');
    });

    it('works with a localhost RPC', () => {
        const client = createEmptyClient().use(localhostRpc()).use(rpcAirdrop());
        expect(client).toHaveProperty('airdrop');
    });

    it('throws a TypeScript error with a mainnet RPC', () => {
        const client = createEmptyClient()
            .use(rpc(mainnet('https://my-rpc.com')))
            // @ts-expect-error Airdrop RPC methods are not available on mainnet.
            .use(rpcAirdrop());
        expect(client).toHaveProperty('airdrop');
    });
});
