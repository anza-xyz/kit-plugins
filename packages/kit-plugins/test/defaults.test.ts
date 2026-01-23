import {
    airdropFactory,
    Rpc,
    RpcSubscriptions,
    SolanaRpcApi,
    SolanaRpcSubscriptionsApi,
    TransactionPlanExecutor,
    TransactionPlanner,
    TransactionSigner,
} from '@solana/kit';
import { beforeEach, describe, expect, expectTypeOf, it, Mock, vi } from 'vitest';

import {
    AirdropFunction,
    createDefaultLiteSVMClient,
    createDefaultLocalhostRpcClient,
    createDefaultRpcClient,
    type LiteSVM,
    RpcFromLiteSVM,
} from '../src';

vi.mock('@solana/kit', async () => {
    const actual = await vi.importActual('@solana/kit');
    return { ...actual, airdropFactory: vi.fn() };
});

beforeEach(() => {
    vi.clearAllMocks();
});

describe('createDefaultRpcClient', () => {
    it('it offers an RPC client', () => {
        const client = createDefaultRpcClient({
            payer: {} as TransactionSigner,
            url: 'https://api.mainnet-beta.solana.com',
        });
        expect(client.rpc).toBeTypeOf('object');
        expectTypeOf(client.rpc).toEqualTypeOf<Rpc<SolanaRpcApi>>();
    });

    it('it offers an RPC Subscriptions client', () => {
        const client = createDefaultRpcClient({
            payer: {} as TransactionSigner,
            url: 'https://api.mainnet-beta.solana.com',
        });
        expect(client.rpcSubscriptions).toBeTypeOf('object');
        expectTypeOf(client.rpcSubscriptions).toEqualTypeOf<RpcSubscriptions<SolanaRpcSubscriptionsApi>>();
    });

    it('it uses the provided payer', () => {
        const payer = {} as TransactionSigner;
        const client = createDefaultRpcClient({ payer, url: 'https://api.mainnet-beta.solana.com' });
        expect(client.payer).toBe(payer);
    });

    it('it offers a default transaction planner', () => {
        const client = createDefaultRpcClient({
            payer: {} as TransactionSigner,
            url: 'https://api.mainnet-beta.solana.com',
        });
        expect(client.transactionPlanner).toBeTypeOf('function');
        expectTypeOf(client.transactionPlanner).toEqualTypeOf<TransactionPlanner>();
    });

    it('it offers a default transaction plan executor', () => {
        const client = createDefaultRpcClient({
            payer: {} as TransactionSigner,
            url: 'https://api.mainnet-beta.solana.com',
        });
        expect(client.transactionPlanExecutor).toBeTypeOf('function');
        expectTypeOf(client.transactionPlanExecutor).toEqualTypeOf<TransactionPlanExecutor>();
    });

    it('it provide helper functions to send transactions', () => {
        const client = createDefaultRpcClient({
            payer: {} as TransactionSigner,
            url: 'https://api.mainnet-beta.solana.com',
        });
        expect(client.sendTransactions).toBeTypeOf('function');
        expect(client.sendTransaction).toBeTypeOf('function');
    });
});

describe('createDefaultLocalhostRpcClient', () => {
    it('it offers an RPC client', async () => {
        const airdropFn = vi.fn().mockResolvedValue('MockSignature');
        (airdropFactory as Mock).mockReturnValueOnce(airdropFn);

        const client = await createDefaultLocalhostRpcClient();
        expect(client.rpc).toBeTypeOf('object');
        expectTypeOf(client.rpc).toEqualTypeOf<Rpc<SolanaRpcApi>>();
    });

    it('it offers an RPC Subscriptions client', async () => {
        const airdropFn = vi.fn().mockResolvedValue('MockSignature');
        (airdropFactory as Mock).mockReturnValueOnce(airdropFn);

        const client = await createDefaultLocalhostRpcClient();
        expect(client.rpcSubscriptions).toBeTypeOf('object');
        expectTypeOf(client.rpcSubscriptions).toEqualTypeOf<RpcSubscriptions<SolanaRpcSubscriptionsApi>>();
    });

    it('it offers an airdrop function', async () => {
        const airdropFn = vi.fn().mockResolvedValue('MockSignature');
        (airdropFactory as Mock).mockReturnValueOnce(airdropFn);

        const client = await createDefaultLocalhostRpcClient();
        expect(client.airdrop).toBeTypeOf('function');
        expectTypeOf(client.airdrop).toEqualTypeOf<AirdropFunction>();
    });

    it('it generates a new payer with SOL by default', async () => {
        const airdropFn = vi.fn().mockResolvedValue('MockSignature');
        (airdropFactory as Mock).mockReturnValueOnce(airdropFn);

        const client = await createDefaultLocalhostRpcClient();
        expect(client.payer).toBeTypeOf('object');
        expectTypeOf(client.payer).toEqualTypeOf<TransactionSigner>();

        expect(airdropFn).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({
                recipientAddress: client.payer.address,
            }),
        );
    });

    it('it uses the provided payer', async () => {
        const payer = {} as TransactionSigner;
        const client = await createDefaultLocalhostRpcClient({ payer });
        expect(client.payer).toBe(payer);
    });

    it('it offers a default transaction planner', async () => {
        const airdropFn = vi.fn().mockResolvedValue('MockSignature');
        (airdropFactory as Mock).mockReturnValueOnce(airdropFn);

        const client = await createDefaultLocalhostRpcClient();
        expect(client.transactionPlanner).toBeTypeOf('function');
        expectTypeOf(client.transactionPlanner).toEqualTypeOf<TransactionPlanner>();
    });

    it('it offers a default transaction plan executor', async () => {
        const airdropFn = vi.fn().mockResolvedValue('MockSignature');
        (airdropFactory as Mock).mockReturnValueOnce(airdropFn);

        const client = await createDefaultLocalhostRpcClient();
        expect(client.transactionPlanExecutor).toBeTypeOf('function');
        expectTypeOf(client.transactionPlanExecutor).toEqualTypeOf<TransactionPlanExecutor>();
    });

    it('it provide helper functions to send transactions', async () => {
        const airdropFn = vi.fn().mockResolvedValue('MockSignature');
        (airdropFactory as Mock).mockReturnValueOnce(airdropFn);

        const client = await createDefaultLocalhostRpcClient();
        expect(client.sendTransactions).toBeTypeOf('function');
        expect(client.sendTransaction).toBeTypeOf('function');
    });

    it('it uses a custom url and subscriptions url', async () => {
        const airdropFn = vi.fn().mockResolvedValue('MockSignature');
        (airdropFactory as Mock).mockReturnValueOnce(airdropFn);

        const client = await createDefaultLocalhostRpcClient({
            rpcSubscriptionsConfig: { url: 'ws://host.docker.internal:8900' },
            url: 'http://host.docker.internal:8899',
        });
        expect(client.airdrop).toBeTypeOf('function');
    });
});

describe('createDefaultLiteSVMClient', () => {
    it('it offers a LiteSVM instance', async () => {
        const client = await createDefaultLiteSVMClient();
        expect(client.svm).toBeTypeOf('object');
        expectTypeOf(client.svm).toEqualTypeOf<LiteSVM>();
    });

    it('it offers an RPC subset', async () => {
        const client = await createDefaultLiteSVMClient();
        expect(client.rpc).toBeTypeOf('object');
        expectTypeOf(client.rpc).toEqualTypeOf<RpcFromLiteSVM>();
    });

    it('it offers an airdrop function', async () => {
        const client = await createDefaultLiteSVMClient();
        expect(client.airdrop).toBeTypeOf('function');
        expectTypeOf(client.airdrop).toEqualTypeOf<AirdropFunction>();
    });

    it('it generates a new payer by default', async () => {
        const client = await createDefaultLiteSVMClient();
        expect(client.payer).toBeTypeOf('object');
        expectTypeOf(client.payer).toEqualTypeOf<TransactionSigner>();
    });

    it('it uses the provided payer', async () => {
        const payer = {} as TransactionSigner;
        const client = await createDefaultLiteSVMClient({ payer });
        expect(client.payer).toBe(payer);
    });

    it('it offers a default transaction planner', async () => {
        const client = await createDefaultLiteSVMClient();
        expect(client.transactionPlanner).toBeTypeOf('function');
        expectTypeOf(client.transactionPlanner).toEqualTypeOf<TransactionPlanner>();
    });

    it('it offers a default transaction plan executor', async () => {
        const client = await createDefaultLiteSVMClient();
        expect(client.transactionPlanExecutor).toBeTypeOf('function');
        expectTypeOf(client.transactionPlanExecutor).toEqualTypeOf<TransactionPlanExecutor>();
    });

    it('it provide helper functions to send transactions', async () => {
        const client = await createDefaultLiteSVMClient();
        expect(client.sendTransactions).toBeTypeOf('function');
        expect(client.sendTransaction).toBeTypeOf('function');
    });
});
