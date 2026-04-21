import { createClient, createSolanaRpc, createSolanaRpcSubscriptions, mainnet, TransactionSigner } from '@solana/kit';
import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

import {
    rpcConnection,
    rpcSubscriptionsConnection,
    solanaDevnetRpc,
    solanaLocalRpc,
    solanaMainnetRpc,
    solanaRpc,
    solanaRpcConnection,
    solanaRpcSubscriptionsConnection,
} from '../src';

vi.mock('@solana/kit', async () => {
    const actual = await vi.importActual<typeof import('@solana/kit')>('@solana/kit');
    return {
        ...actual,
        createSolanaRpc: vi.fn(actual.createSolanaRpc),
        createSolanaRpcSubscriptions: vi.fn(actual.createSolanaRpcSubscriptions),
    };
});

beforeEach(() => {
    vi.clearAllMocks();
});

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
    it('creates and sets a Solana RPC and Solana RPC Subscriptions from a config', () => {
        const client = createClient().use(solanaRpcConnection({ rpcUrl: 'https://api.mainnet-beta.solana.com' }));
        expect(client).toHaveProperty('rpc');
        expect(client).toHaveProperty('rpcSubscriptions');
        expect(client.rpc.sendTransaction).toBeTypeOf('function');
        expect(client.rpcSubscriptions.accountNotifications).toBeTypeOf('function');
    });

    it('narrows the RPC API based on the cluster', () => {
        const client = createClient().use(
            solanaRpcConnection({ rpcUrl: mainnet('https://api.mainnet-beta.solana.com') }),
        );
        expectTypeOf(client.rpc).not.toHaveProperty('requestAirdrop');
    });

    it('derives the WebSocket URL from the RPC URL by default', () => {
        createClient().use(solanaRpcConnection({ rpcUrl: 'https://api.mainnet-beta.solana.com' }));
        expect(createSolanaRpcSubscriptions).toHaveBeenCalledWith('wss://api.mainnet-beta.solana.com', undefined);
    });

    it('also derives ws:// from http:// for unsecured endpoints', () => {
        createClient().use(solanaRpcConnection({ rpcUrl: 'http://127.0.0.1:8899' }));
        expect(createSolanaRpcSubscriptions).toHaveBeenCalledWith('ws://127.0.0.1:8899', undefined);
    });

    it('accepts an explicit rpcSubscriptionsUrl', () => {
        createClient().use(
            solanaRpcConnection({
                rpcSubscriptionsUrl: 'wss://custom-ws.solana.com',
                rpcUrl: 'https://api.mainnet-beta.solana.com',
            }),
        );
        expect(createSolanaRpcSubscriptions).toHaveBeenCalledWith('wss://custom-ws.solana.com', undefined);
    });

    it('forwards rpcConfig and rpcSubscriptionsConfig to the underlying factories', () => {
        const rpcConfig = {};
        const rpcSubscriptionsConfig = {};
        createClient().use(
            solanaRpcConnection({
                rpcConfig,
                rpcSubscriptionsConfig,
                rpcUrl: 'https://api.mainnet-beta.solana.com',
            }),
        );
        expect(createSolanaRpc).toHaveBeenCalledWith('https://api.mainnet-beta.solana.com', rpcConfig);
        expect(createSolanaRpcSubscriptions).toHaveBeenCalledWith(
            'wss://api.mainnet-beta.solana.com',
            rpcSubscriptionsConfig,
        );
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
