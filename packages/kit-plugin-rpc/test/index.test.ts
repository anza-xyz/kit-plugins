import { createClient, createSolanaRpc, createSolanaRpcSubscriptions, mainnet } from '@solana/kit';
import { describe, expect, expectTypeOf, it } from 'vitest';

import {
    rpcConnection,
    rpcSubscriptionsConnection,
    solanaRpcConnection,
    solanaRpcSubscriptionsConnection,
} from '../src';

describe('rpcConnection', () => {
    it('sets the provided rpc instance on the client', () => {
        const myRpc = createSolanaRpc('https://api.mainnet-beta.solana.com');
        const client = createClient().use(rpcConnection(myRpc));
        expect(client).toHaveProperty('rpc');
        expect(client.rpc).toBe(myRpc);
    });
});

describe('rpcSubscriptionsConnection', () => {
    it('sets the provided rpcSubscriptions instance on the client', () => {
        const myRpcSubscriptions = createSolanaRpcSubscriptions('wss://api.mainnet-beta.solana.com');
        const client = createClient().use(rpcSubscriptionsConnection(myRpcSubscriptions));
        expect(client).toHaveProperty('rpcSubscriptions');
        expect(client.rpcSubscriptions).toBe(myRpcSubscriptions);
    });
});

describe('solanaRpcConnection', () => {
    it('creates and sets a Solana RPC from a URL', () => {
        const client = createClient().use(solanaRpcConnection('https://api.mainnet-beta.solana.com'));
        expect(client).toHaveProperty('rpc');
        expect(client.rpc.sendTransaction).toBeTypeOf('function');
    });

    it('narrows the RPC API based on the cluster', () => {
        const client = createClient().use(solanaRpcConnection(mainnet('https://api.mainnet-beta.solana.com')));
        expectTypeOf(client.rpc).not.toHaveProperty('requestAirdrop');
    });
});

describe('solanaRpcSubscriptionsConnection', () => {
    it('creates and sets Solana RPC Subscriptions from a URL', () => {
        const client = createClient().use(solanaRpcSubscriptionsConnection('wss://api.mainnet-beta.solana.com'));
        expect(client).toHaveProperty('rpcSubscriptions');
        expect(client.rpcSubscriptions.accountNotifications).toBeTypeOf('function');
    });
});
