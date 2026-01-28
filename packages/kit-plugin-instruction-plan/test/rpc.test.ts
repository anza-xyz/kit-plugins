import {
    Address,
    createEmptyClient,
    createTransactionMessage,
    generateKeyPairSigner,
    parallelTransactionPlan,
    Rpc,
    RpcSubscriptions,
    sendAndConfirmTransactionFactory,
    setTransactionMessageFeePayerSigner,
    singleInstructionPlan,
    SingleTransactionPlan,
    singleTransactionPlan,
    SingleTransactionPlanResult,
    SOLANA_ERROR__INSTRUCTION_PLANS__FAILED_TO_EXECUTE_TRANSACTION_PLAN,
    SOLANA_ERROR__TRANSACTION__FAILED_WHEN_SIMULATING_TO_ESTIMATE_COMPUTE_LIMIT,
    SolanaError,
    SolanaRpcApi,
    SolanaRpcSubscriptionsApi,
    TransactionSigner,
} from '@solana/kit';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { defaultTransactionPlannerAndExecutorFromRpc } from '../src';

const MOCK_BLOCKHASH = { blockhash: '11111111111111111111111111111111', lastValidBlockHeight: 0n };
const MOCK_INSTRUCTION = {
    programAddress: '11111111111111111111111111111111' as Address,
};

vi.mock('@solana/kit', async () => {
    const actual = await vi.importActual('@solana/kit');
    return { ...actual, sendAndConfirmTransactionFactory: vi.fn() };
});

beforeEach(() => {
    vi.clearAllMocks();
});

describe('defaultTransactionPlannerAndExecutorFromRpc', () => {
    it('provides a default transactionPlanner and transactionPlanExecutor on the client', () => {
        const payer = {} as TransactionSigner;
        const rpc = {} as Rpc<SolanaRpcApi>;
        const rpcSubscriptions = {} as RpcSubscriptions<SolanaRpcSubscriptionsApi>;
        const client = createEmptyClient()
            .use(() => ({ payer, rpc, rpcSubscriptions }))
            .use(defaultTransactionPlannerAndExecutorFromRpc());
        expect(client).toHaveProperty('transactionPlanner');
        expect(client).toHaveProperty('transactionPlanExecutor');
    });

    it('uses the provided payer as fee payer when planning transactions', async () => {
        const payer = await generateKeyPairSigner();
        const rpc = {} as Rpc<SolanaRpcApi>;
        const rpcSubscriptions = {} as RpcSubscriptions<SolanaRpcSubscriptionsApi>;
        const client = createEmptyClient()
            .use(() => ({ payer, rpc, rpcSubscriptions }))
            .use(defaultTransactionPlannerAndExecutorFromRpc());

        const instructionPlan = singleInstructionPlan(MOCK_INSTRUCTION);
        const transactionPlan = (await client.transactionPlanner(instructionPlan)) as SingleTransactionPlan;
        expect(transactionPlan.kind).toBe('single');
        expect(transactionPlan.message.feePayer).toBe(payer);
    });

    it('uses the RPC and RPC Subscriptions to send transactions', async () => {
        const payer = await generateKeyPairSigner();
        const getLatestBlockhash = vi.fn().mockResolvedValue({ value: MOCK_BLOCKHASH });
        const simulateTransaction = vi.fn().mockResolvedValue({ value: { unitsConsumed: 42 } });
        const rpc = {
            getLatestBlockhash: () => ({ send: getLatestBlockhash }),
            simulateTransaction: () => ({ send: simulateTransaction }),
        } as unknown as Rpc<SolanaRpcApi>;
        const rpcSubscriptions = {} as RpcSubscriptions<SolanaRpcSubscriptionsApi>;
        const sendAndConfirmTransaction = vi.fn().mockResolvedValue('MockTransactionSignature');
        (sendAndConfirmTransactionFactory as Mock).mockReturnValueOnce(sendAndConfirmTransaction);

        const client = createEmptyClient()
            .use(() => ({ payer, rpc, rpcSubscriptions }))
            .use(defaultTransactionPlannerAndExecutorFromRpc());

        const instructionPlan = singleInstructionPlan(MOCK_INSTRUCTION);
        const transactionPlan = await client.transactionPlanner(instructionPlan);
        const transactionPlanResult = (await client.transactionPlanExecutor(
            transactionPlan,
        )) as SingleTransactionPlanResult;
        expect(transactionPlanResult.kind).toBe('single');
        expect(getLatestBlockhash).toHaveBeenCalledOnce();
        expect(sendAndConfirmTransactionFactory).toHaveBeenCalledExactlyOnceWith({ rpc, rpcSubscriptions });
        expect(sendAndConfirmTransaction).toHaveBeenCalledOnce();
    });

    it('does not perform two simulation preflights when executing transactions', async () => {
        const payer = await generateKeyPairSigner();
        const getLatestBlockhash = vi.fn().mockResolvedValue({ value: MOCK_BLOCKHASH });
        const simulateTransaction = vi.fn().mockResolvedValue({ value: { unitsConsumed: 42 } });
        const rpc = {
            getLatestBlockhash: () => ({ send: getLatestBlockhash }),
            simulateTransaction: () => ({ send: simulateTransaction }),
        } as unknown as Rpc<SolanaRpcApi>;
        const rpcSubscriptions = {} as RpcSubscriptions<SolanaRpcSubscriptionsApi>;
        const sendAndConfirmTransaction = vi.fn().mockResolvedValue('MockTransactionSignature');
        (sendAndConfirmTransactionFactory as Mock).mockReturnValueOnce(sendAndConfirmTransaction);

        const client = createEmptyClient()
            .use(() => ({ payer, rpc, rpcSubscriptions }))
            .use(defaultTransactionPlannerAndExecutorFromRpc());

        await client.transactionPlanExecutor(
            singleTransactionPlan(setTransactionMessageFeePayerSigner(payer, createTransactionMessage({ version: 0 }))),
        );

        // We already performed one simulation when estimating the compute unit limit.
        expect(simulateTransaction).toHaveBeenCalledOnce();

        // So we should not perform it again when sending the transaction.
        expect(sendAndConfirmTransaction).toHaveBeenCalledExactlyOnceWith(expect.anything(), {
            commitment: 'confirmed',
            skipPreflight: true,
        });
    });

    it('unwraps simulation errors when executing transactions', async () => {
        const payer = await generateKeyPairSigner();
        const getLatestBlockhash = vi.fn().mockResolvedValue({ value: MOCK_BLOCKHASH });
        const simulateTransaction = vi.fn().mockResolvedValue({ value: { unitsConsumed: 42 } });
        const rpc = {
            getLatestBlockhash: () => ({ send: getLatestBlockhash }),
            simulateTransaction: () => ({ send: simulateTransaction }),
        } as unknown as Rpc<SolanaRpcApi>;
        const rpcSubscriptions = {} as RpcSubscriptions<SolanaRpcSubscriptionsApi>;
        const originalError = new Error('Original transaction error');
        const sendAndConfirmTransaction = vi.fn().mockRejectedValue(
            new SolanaError(SOLANA_ERROR__TRANSACTION__FAILED_WHEN_SIMULATING_TO_ESTIMATE_COMPUTE_LIMIT, {
                cause: originalError,
                unitsConsumed: 42,
            }),
        );
        (sendAndConfirmTransactionFactory as Mock).mockReturnValueOnce(sendAndConfirmTransaction);

        const client = createEmptyClient()
            .use(() => ({ payer, rpc, rpcSubscriptions }))
            .use(defaultTransactionPlannerAndExecutorFromRpc());

        const transactionPlan = singleTransactionPlan(
            setTransactionMessageFeePayerSigner(payer, createTransactionMessage({ version: 0 })),
        );
        const promise = client.transactionPlanExecutor(transactionPlan);
        await expect(promise).rejects.toThrowError(
            new SolanaError(SOLANA_ERROR__INSTRUCTION_PLANS__FAILED_TO_EXECUTE_TRANSACTION_PLAN, {
                cause: originalError,
            }),
        );
    });

    it('does not unwrap non-simulation errors when executing transactions', async () => {
        const payer = await generateKeyPairSigner();
        const getLatestBlockhash = vi.fn().mockResolvedValue({ value: MOCK_BLOCKHASH });
        const simulateTransaction = vi.fn().mockResolvedValue({ value: { unitsConsumed: 42 } });
        const rpc = {
            getLatestBlockhash: () => ({ send: getLatestBlockhash }),
            simulateTransaction: () => ({ send: simulateTransaction }),
        } as unknown as Rpc<SolanaRpcApi>;
        const rpcSubscriptions = {} as RpcSubscriptions<SolanaRpcSubscriptionsApi>;
        const originalError = new Error('Original transaction error');
        const sendAndConfirmTransaction = vi.fn().mockRejectedValue(originalError);
        (sendAndConfirmTransactionFactory as Mock).mockReturnValueOnce(sendAndConfirmTransaction);

        const client = createEmptyClient()
            .use(() => ({ payer, rpc, rpcSubscriptions }))
            .use(defaultTransactionPlannerAndExecutorFromRpc());

        const transactionPlan = singleTransactionPlan(
            setTransactionMessageFeePayerSigner(payer, createTransactionMessage({ version: 0 })),
        );
        const promise = client.transactionPlanExecutor(transactionPlan);
        await expect(promise).rejects.toThrowError(
            new SolanaError(SOLANA_ERROR__INSTRUCTION_PLANS__FAILED_TO_EXECUTE_TRANSACTION_PLAN, {
                cause: originalError,
            }),
        );
    });

    it('limits the number of concurrent executions for parallel transaction plans', async () => {
        const payer = await generateKeyPairSigner();
        const rpc = {
            getLatestBlockhash: () => ({ send: vi.fn().mockResolvedValue({ value: MOCK_BLOCKHASH }) }),
            simulateTransaction: () => ({ send: vi.fn().mockResolvedValue({ value: { unitsConsumed: 42 } }) }),
        } as unknown as Rpc<SolanaRpcApi>;
        const rpcSubscriptions = {} as RpcSubscriptions<SolanaRpcSubscriptionsApi>;
        const resolvers: Array<() => void> = [];
        const sendAndConfirmTransaction = vi.fn().mockImplementation(() => {
            return new Promise<void>(resolve => {
                resolvers.push(resolve);
            });
        });
        (sendAndConfirmTransactionFactory as Mock).mockReturnValueOnce(sendAndConfirmTransaction);

        const client = createEmptyClient()
            .use(() => ({ payer, rpc, rpcSubscriptions }))
            .use(defaultTransactionPlannerAndExecutorFromRpc({ maxConcurrency: 2 }));

        const singleTransactionPlan = await client.transactionPlanner(singleInstructionPlan(MOCK_INSTRUCTION));
        const transactionPlan = parallelTransactionPlan([
            singleTransactionPlan,
            singleTransactionPlan,
            singleTransactionPlan,
            singleTransactionPlan,
        ]);
        const promise = client.transactionPlanExecutor(transactionPlan).catch(() => {});

        // First, only two transactions are executed in parallel.
        await vi.waitFor(() => expect(resolvers.length).toBeGreaterThan(0));
        expect(sendAndConfirmTransaction).toHaveBeenCalledTimes(2);

        // When one finishes, the next one can start.
        resolvers[0]();
        await vi.waitFor(() => expect(resolvers.length).toBe(3));
        expect(sendAndConfirmTransaction).toHaveBeenCalledTimes(3);

        // When the second one finishes, the last one can start.
        resolvers[1]();
        await vi.waitFor(() => expect(resolvers.length).toBe(4));
        expect(sendAndConfirmTransaction).toHaveBeenCalledTimes(4);

        // Finish the last ones.
        resolvers[2]();
        resolvers[3]();
        await promise;
    });

    it('requires an RPC API on the client', () => {
        const rpcSubscriptions = {} as RpcSubscriptions<SolanaRpcSubscriptionsApi>;
        expect(() =>
            createEmptyClient()
                .use(() => ({ rpcSubscriptions }))
                // @ts-expect-error Missing RPC on the client.
                .use(defaultTransactionPlannerAndExecutorFromRpc()),
        ).toThrow();
    });

    it('requires an RPC Subscriptions API on the client', () => {
        const rpc = {} as Rpc<SolanaRpcApi>;
        expect(() =>
            createEmptyClient()
                .use(() => ({ rpc }))
                // @ts-expect-error Missing RPC Subscriptions on the client.
                .use(defaultTransactionPlannerAndExecutorFromRpc()),
        ).toThrow();
    });

    it('requires a payer on the client by default', () => {
        const rpc = {} as Rpc<SolanaRpcApi>;
        const rpcSubscriptions = {} as RpcSubscriptions<SolanaRpcSubscriptionsApi>;
        expect(() =>
            createEmptyClient()
                .use(() => ({ rpc, rpcSubscriptions }))
                .use(defaultTransactionPlannerAndExecutorFromRpc()),
        ).toThrow();
    });

    it('also accepts a payer directly', () => {
        const payer = {} as TransactionSigner;
        const rpc = {} as Rpc<SolanaRpcApi>;
        const rpcSubscriptions = {} as RpcSubscriptions<SolanaRpcSubscriptionsApi>;
        expect(() =>
            createEmptyClient()
                .use(() => ({ rpc, rpcSubscriptions }))
                .use(defaultTransactionPlannerAndExecutorFromRpc({ payer })),
        ).not.toThrow();
    });

    it('uses the provided payer over the one set on the client', async () => {
        const [clientPayer, explicitPayer] = await Promise.all([generateKeyPairSigner(), generateKeyPairSigner()]);
        const rpc = {} as Rpc<SolanaRpcApi>;
        const rpcSubscriptions = {} as RpcSubscriptions<SolanaRpcSubscriptionsApi>;
        const client = createEmptyClient()
            .use(() => ({ payer: clientPayer, rpc, rpcSubscriptions }))
            .use(defaultTransactionPlannerAndExecutorFromRpc({ payer: explicitPayer }));

        const instructionPlan = singleInstructionPlan(MOCK_INSTRUCTION);
        const transactionPlan = (await client.transactionPlanner(instructionPlan)) as SingleTransactionPlan;
        expect(transactionPlan.kind).toBe('single');
        expect(transactionPlan.message.feePayer).toBe(explicitPayer);
    });
});
