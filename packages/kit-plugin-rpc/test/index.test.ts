import { createEmptyClient, mainnet } from '@solana/kit';
import { describe, expect, expectTypeOf, it } from 'vitest';

import { localhostRpc, rpc } from '../src';

describe('rpc', () => {
    it('initializes the rpc and rpcSubscriptions properties', () => {
        const client = createEmptyClient().use(rpc('https://api.mainnet-beta.solana.com'));
        expect(client).toHaveProperty('rpc');
        expect(client).toHaveProperty('rpcSubscriptions');
        expect(client.rpc.sendTransaction).toBeTypeOf('function');
        expect(client.rpcSubscriptions.accountNotifications).toBeTypeOf('function');
    });

    it('narrows the RPC API based on the cluster', () => {
        const client = createEmptyClient().use(rpc(mainnet('https://api.mainnet-beta.solana.com')));
        expectTypeOf(client.rpc).not.toHaveProperty('requestAirdrop');
    });
});

describe('localhostRpc', () => {
    it('initializes the rpc and rpcSubscriptions properties', () => {
        const client = createEmptyClient().use(localhostRpc());
        expect(client).toHaveProperty('rpc');
        expect(client).toHaveProperty('rpcSubscriptions');
        expect(client.rpc.sendTransaction).toBeTypeOf('function');
        expect(client.rpcSubscriptions.accountNotifications).toBeTypeOf('function');
    });

    it('has access to airdrop methods', () => {
        const client = createEmptyClient().use(localhostRpc());
        expectTypeOf(client.rpc).toHaveProperty('requestAirdrop');
    });
});
