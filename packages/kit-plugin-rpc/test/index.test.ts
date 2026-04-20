import { createClient, createSolanaRpc, createSolanaRpcSubscriptions, mainnet, TransactionSigner } from '@solana/kit';
import { describe, expect, expectTypeOf, it } from 'vitest';

import {
    rpcConnection,
    rpcSubscriptionsConnection,
    solanaDevnetRpc,
    solanaDevnetRpcReadOnly,
    solanaLocalRpc,
    solanaLocalRpcReadOnly,
    solanaMainnetRpc,
    solanaMainnetRpcReadOnly,
    solanaRpc,
    solanaRpcConnection,
    solanaRpcReadOnly,
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

describe('solanaRpc', () => {
    const payer = {} as TransactionSigner;

    it('sets up a full RPC client with all plugins', () => {
        const client = createClient()
            .use(() => ({ payer }))
            .use(solanaRpc({ rpcUrl: 'https://api.mainnet-beta.solana.com' }));
        expect(client).toHaveProperty('rpc');
        expect(client).toHaveProperty('rpcSubscriptions');
        expect(client).toHaveProperty('getMinimumBalance');
        expect(client).toHaveProperty('transactionPlanner');
        expect(client).toHaveProperty('transactionPlanExecutor');
        expect(client).toHaveProperty('sendTransactions');
    });

    it('derives the WebSocket URL from the RPC URL by default', () => {
        const client = createClient()
            .use(() => ({ payer }))
            .use(solanaRpc({ rpcUrl: 'https://api.mainnet-beta.solana.com' }));
        expect(client).toHaveProperty('rpcSubscriptions');
    });

    it('accepts an explicit rpcSubscriptionsUrl', () => {
        const client = createClient()
            .use(() => ({ payer }))
            .use(
                solanaRpc({
                    rpcSubscriptionsUrl: 'wss://custom-ws.solana.com',
                    rpcUrl: 'https://api.mainnet-beta.solana.com',
                }),
            );
        expect(client).toHaveProperty('rpcSubscriptions');
    });
});

describe('solanaRpcReadOnly', () => {
    it('sets up rpc, rpcSubscriptions, and getMinimumBalance without a payer', () => {
        const client = createClient().use(solanaRpcReadOnly({ rpcUrl: 'https://api.mainnet-beta.solana.com' }));
        expect(client).toHaveProperty('rpc');
        expect(client).toHaveProperty('rpcSubscriptions');
        expect(client).toHaveProperty('getMinimumBalance');
    });

    it('does not install transaction planning or sending', () => {
        const client = createClient().use(solanaRpcReadOnly({ rpcUrl: 'https://api.mainnet-beta.solana.com' }));
        expect(client).not.toHaveProperty('sendTransaction');
        expect(client).not.toHaveProperty('sendTransactions');
        expect(client).not.toHaveProperty('planTransaction');
        expect(client).not.toHaveProperty('planTransactions');
        expect(client).not.toHaveProperty('transactionPlanner');
        expect(client).not.toHaveProperty('transactionPlanExecutor');
    });

    it('derives the WebSocket URL from the RPC URL by default', () => {
        const client = createClient().use(solanaRpcReadOnly({ rpcUrl: 'https://api.mainnet-beta.solana.com' }));
        expect(client).toHaveProperty('rpcSubscriptions');
    });

    it('accepts an explicit rpcSubscriptionsUrl', () => {
        const client = createClient().use(
            solanaRpcReadOnly({
                rpcSubscriptionsUrl: 'wss://custom-ws.solana.com',
                rpcUrl: 'https://api.mainnet-beta.solana.com',
            }),
        );
        expect(client).toHaveProperty('rpcSubscriptions');
    });
});

describe('solanaMainnetRpcReadOnly', () => {
    it('sets up a mainnet read-only client without a payer', () => {
        const client = createClient().use(solanaMainnetRpcReadOnly({ rpcUrl: 'https://api.mainnet-beta.solana.com' }));
        expect(client).toHaveProperty('rpc');
        expect(client).toHaveProperty('rpcSubscriptions');
        expect(client).toHaveProperty('getMinimumBalance');
    });

    it('does not include airdrop or transaction sending', () => {
        const client = createClient().use(solanaMainnetRpcReadOnly({ rpcUrl: 'https://api.mainnet-beta.solana.com' }));
        expect(client).not.toHaveProperty('airdrop');
        expect(client).not.toHaveProperty('sendTransaction');
        expect(client).not.toHaveProperty('sendTransactions');
    });
});

describe('solanaDevnetRpcReadOnly', () => {
    it('sets up a devnet read-only client with airdrop and without a payer', () => {
        const client = createClient().use(solanaDevnetRpcReadOnly());
        expect(client).toHaveProperty('rpc');
        expect(client).toHaveProperty('rpcSubscriptions');
        expect(client).toHaveProperty('getMinimumBalance');
        expect(client).toHaveProperty('airdrop');
    });

    it('does not install transaction sending', () => {
        const client = createClient().use(solanaDevnetRpcReadOnly());
        expect(client).not.toHaveProperty('sendTransaction');
        expect(client).not.toHaveProperty('sendTransactions');
    });

    it('accepts custom config overrides', () => {
        const client = createClient().use(solanaDevnetRpcReadOnly({ rpcUrl: 'https://my-devnet-rpc.com' }));
        expect(client).toHaveProperty('rpc');
    });
});

describe('solanaLocalRpcReadOnly', () => {
    it('sets up a localhost read-only client with airdrop and without a payer', () => {
        const client = createClient().use(solanaLocalRpcReadOnly());
        expect(client).toHaveProperty('rpc');
        expect(client).toHaveProperty('rpcSubscriptions');
        expect(client).toHaveProperty('getMinimumBalance');
        expect(client).toHaveProperty('airdrop');
    });

    it('does not install transaction sending', () => {
        const client = createClient().use(solanaLocalRpcReadOnly());
        expect(client).not.toHaveProperty('sendTransaction');
        expect(client).not.toHaveProperty('sendTransactions');
    });

    it('accepts custom config overrides', () => {
        const client = createClient().use(solanaLocalRpcReadOnly({ rpcUrl: 'http://127.0.0.1:9999' }));
        expect(client).toHaveProperty('rpc');
    });
});

describe('solanaMainnetRpc', () => {
    const payer = {} as TransactionSigner;

    it('sets up a full mainnet RPC client', () => {
        const client = createClient()
            .use(() => ({ payer }))
            .use(solanaMainnetRpc({ rpcUrl: 'https://api.mainnet-beta.solana.com' }));
        expect(client).toHaveProperty('rpc');
        expect(client).toHaveProperty('rpcSubscriptions');
        expect(client).toHaveProperty('sendTransactions');
    });

    it('does not include airdrop', () => {
        const client = createClient()
            .use(() => ({ payer }))
            .use(solanaMainnetRpc({ rpcUrl: 'https://api.mainnet-beta.solana.com' }));
        expect(client).not.toHaveProperty('airdrop');
    });
});

describe('solanaDevnetRpc', () => {
    const payer = {} as TransactionSigner;

    it('sets up a full devnet RPC client with airdrop', () => {
        const client = createClient()
            .use(() => ({ payer }))
            .use(solanaDevnetRpc());
        expect(client).toHaveProperty('rpc');
        expect(client).toHaveProperty('rpcSubscriptions');
        expect(client).toHaveProperty('sendTransactions');
        expect(client).toHaveProperty('airdrop');
    });

    it('accepts custom config overrides', () => {
        const client = createClient()
            .use(() => ({ payer }))
            .use(solanaDevnetRpc({ rpcUrl: 'https://my-devnet-rpc.com' }));
        expect(client).toHaveProperty('rpc');
    });
});

describe('solanaLocalRpc', () => {
    const payer = {} as TransactionSigner;

    it('sets up a full localhost RPC client with airdrop', () => {
        const client = createClient()
            .use(() => ({ payer }))
            .use(solanaLocalRpc());
        expect(client).toHaveProperty('rpc');
        expect(client).toHaveProperty('rpcSubscriptions');
        expect(client).toHaveProperty('sendTransactions');
        expect(client).toHaveProperty('airdrop');
    });

    it('accepts custom config overrides', () => {
        const client = createClient()
            .use(() => ({ payer }))
            .use(solanaLocalRpc({ rpcUrl: 'http://127.0.0.1:9999' }));
        expect(client).toHaveProperty('rpc');
    });
});
