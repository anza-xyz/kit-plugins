import { createClient, mainnet } from '@solana/kit';
import { describe, expect, it, vi } from 'vitest';

import { rpcAirdrop, solanaRpcConnection, solanaRpcSubscriptionsConnection } from '../src';

describe('rpcAirdrop', () => {
    it('provides an airdrop function that relies on RPCs', () => {
        const getSignatureStatuses = vi.fn();
        const requestAirdrop = vi.fn();
        const signatureNotifications = vi.fn();
        const client = createClient()
            .use(() => ({
                rpc: { getSignatureStatuses, requestAirdrop },
                rpcSubscriptions: { signatureNotifications },
            }))
            .use(rpcAirdrop());
        expect(client).toHaveProperty('airdrop');
        expect(client.airdrop).toBeTypeOf('function');
    });

    it('works with a Solana RPC connection', () => {
        const client = createClient()
            .use(solanaRpcConnection('https://my-rpc.com'))
            .use(solanaRpcSubscriptionsConnection('wss://my-rpc.com'))
            .use(rpcAirdrop());
        expect(client).toHaveProperty('airdrop');
    });

    it('throws a TypeScript error with a mainnet RPC', () => {
        const client = createClient()
            .use(solanaRpcConnection(mainnet('https://my-rpc.com')))
            .use(solanaRpcSubscriptionsConnection(mainnet('wss://my-rpc.com')))
            // @ts-expect-error Airdrop RPC methods are not available on mainnet.
            .use(rpcAirdrop());
        expect(client).toHaveProperty('airdrop');
    });
});
