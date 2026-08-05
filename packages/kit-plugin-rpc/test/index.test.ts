import {
    Address,
    createClient,
    createSolanaRpc,
    createSolanaRpcSubscriptions,
    createTransactionMessage,
    mainnet,
    setTransactionMessageFeePayer,
    Signature,
    singleTransactionPlan,
    successfulSingleTransactionPlanResult,
    TransactionSigner,
} from '@solana/kit';
import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

import {
    createRpcTransactionSendingExecutor,
    rpc,
    rpcConnection,
    rpcSubscriptionsConnection,
    solanaDevnetRpc,
    solanaLocalRpc,
    solanaMainnetRpc,
    solanaRpc,
    solanaRpcConnection,
    solanaRpcSubscriptionsConnection,
    solanaTestnetRpc,
} from '../src';

vi.mock('@solana/kit', async () => {
    const actual = await vi.importActual<typeof import('@solana/kit')>('@solana/kit');
    return {
        ...actual,
        createSolanaRpc: vi.fn(actual.createSolanaRpc),
        createSolanaRpcSubscriptions: vi.fn(actual.createSolanaRpcSubscriptions),
    };
});

vi.mock('../src/transaction-plan-executor', async () => {
    const actual = await vi.importActual<typeof import('../src/transaction-plan-executor')>(
        '../src/transaction-plan-executor',
    );
    return {
        ...actual,
        createRpcTransactionSendingExecutor: vi.fn(actual.createRpcTransactionSendingExecutor),
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
        createClient().use(solanaRpcConnection({ rpcUrl: 'http://example.local:8080' }));
        expect(createSolanaRpcSubscriptions).toHaveBeenCalledWith('ws://example.local:8080', undefined);
    });

    it('rewrites the canonical local validator RPC port (8899 -> 8900) when deriving the WebSocket URL', () => {
        createClient().use(solanaRpcConnection({ rpcUrl: 'http://127.0.0.1:8899' }));
        expect(createSolanaRpcSubscriptions).toHaveBeenCalledWith('ws://127.0.0.1:8900', undefined);
    });

    it('also rewrites 8899 -> 8900 for the localhost hostname', () => {
        createClient().use(solanaRpcConnection({ rpcUrl: 'http://localhost:8899' }));
        expect(createSolanaRpcSubscriptions).toHaveBeenCalledWith('ws://localhost:8900', undefined);
    });

    it('preserves non-default localhost ports', () => {
        createClient().use(solanaRpcConnection({ rpcUrl: 'http://127.0.0.1:9000' }));
        expect(createSolanaRpcSubscriptions).toHaveBeenCalledWith('ws://127.0.0.1:9000', undefined);
    });

    it('does not rewrite the port for https://127.0.0.1:8899 (allowlist is exact-string http only)', () => {
        createClient().use(solanaRpcConnection({ rpcUrl: 'https://127.0.0.1:8899' }));
        expect(createSolanaRpcSubscriptions).toHaveBeenCalledWith('wss://127.0.0.1:8899', undefined);
    });

    it('derives wss:// from https:// for mainnet input', () => {
        createClient().use(solanaRpcConnection({ rpcUrl: mainnet('https://api.mainnet-beta.solana.com') }));
        expect(createSolanaRpcSubscriptions).toHaveBeenCalledWith('wss://api.mainnet-beta.solana.com', undefined);
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

describe('rpc (deprecated)', () => {
    it('rewrites the canonical local validator RPC port (8899 -> 8900) when deriving the WebSocket URL', () => {
        createClient().use(rpc('http://127.0.0.1:8899'));
        expect(createSolanaRpcSubscriptions).toHaveBeenCalledWith('ws://127.0.0.1:8900', undefined);
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

    it('adds the signing functions to the client', () => {
        const client = createClient()
            .use(() => ({ payer }))
            .use(solanaRpc({ rpcUrl: 'http://127.0.0.1:8899' }));

        expect(client).toHaveProperty('signTransaction');
        expect(client).toHaveProperty('signTransactions');
    });

    it('still exposes the deprecated transactionPlanExecutor', () => {
        const client = createClient()
            .use(() => ({ payer }))
            .use(solanaRpc({ rpcUrl: 'http://127.0.0.1:8899' }));

        // Retained so that this change is not breaking; removal is a later major.
        expect(client).toHaveProperty('transactionPlanExecutor');
    });

    it('installs the very sending executor instance created for it as the deprecated transactionPlanExecutor, not an equivalent second one', () => {
        const client = createClient()
            .use(() => ({ payer }))
            .use(solanaRpc({ rpcUrl: 'http://127.0.0.1:8899' }));

        // Only one sending executor is ever constructed for this client...
        expect(createRpcTransactionSendingExecutor).toHaveBeenCalledTimes(1);
        // ...and the deprecated property holds exactly that instance (not a second one
        // built from the same config, which would double effective concurrency for
        // anyone using `transactionPlanExecutor` alongside `sendTransaction`).
        expect(client.transactionPlanExecutor).toBe(
            vi.mocked(createRpcTransactionSendingExecutor).mock.results[0].value,
        );
    });

    it('routes client.sendTransaction to the sending executor it built, not the signing one', async () => {
        // A transaction message (rather than an instruction) is passed as input so that
        // planning is skipped entirely (see `parseInstructionOrTransactionPlanInput`) and
        // the call goes straight to whichever executor `sendTransaction` is wired to. This
        // isolates the executor-routing behavior from the real `rpcTransactionPlanner`.
        const transactionMessage = setTransactionMessageFeePayer(
            '11111111111111111111111111111111' as Address,
            createTransactionMessage({ version: 0 }),
        );
        const sentResult = successfulSingleTransactionPlanResult(transactionMessage, {
            signature: 'signature' as Signature,
        });
        const sendingExecutorMock = vi.fn().mockResolvedValue(sentResult);
        vi.mocked(createRpcTransactionSendingExecutor).mockReturnValueOnce(sendingExecutorMock);

        const client = createClient()
            .use(() => ({ payer }))
            .use(solanaRpc({ rpcUrl: 'http://127.0.0.1:8899' }));

        const result = await client.sendTransaction(transactionMessage);

        expect(result).toBe(sentResult);
        expect(sendingExecutorMock).toHaveBeenCalledExactlyOnceWith(singleTransactionPlan(transactionMessage), {
            abortSignal: undefined,
        });
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

describe('solanaTestnetRpc', () => {
    const payer = {} as TransactionSigner;

    it('sets up a full testnet RPC client with airdrop', () => {
        const client = createClient()
            .use(() => ({ payer }))
            .use(solanaTestnetRpc());
        expect(client).toHaveProperty('rpc');
        expect(client).toHaveProperty('rpcSubscriptions');
        expect(client).toHaveProperty('sendTransactions');
        expect(client).toHaveProperty('airdrop');
    });

    it('accepts custom config overrides', () => {
        const client = createClient()
            .use(() => ({ payer }))
            .use(solanaTestnetRpc({ rpcUrl: 'https://my-testnet-rpc.com' }));
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
