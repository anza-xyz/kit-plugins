import {
    Address,
    createEmptyClient,
    createTransactionMessage,
    generateKeyPairSigner,
    parallelTransactionPlan,
    pipe,
    Rpc,
    RpcSubscriptions,
    sendAndConfirmTransactionFactory,
    setTransactionMessageFeePayerSigner,
    singleInstructionPlan,
    singleTransactionPlan,
    SingleTransactionPlanResult,
    SOLANA_ERROR__INSTRUCTION_PLANS__FAILED_TO_EXECUTE_TRANSACTION_PLAN,
    SOLANA_ERROR__TRANSACTION__FAILED_WHEN_SIMULATING_TO_ESTIMATE_COMPUTE_LIMIT,
    SolanaError,
    SolanaRpcApi,
    SolanaRpcSubscriptionsApi,
} from '@solana/kit';
import { updateOrAppendSetComputeUnitLimitInstruction } from '@solana-program/compute-budget';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { rpcTransactionPlanExecutor, rpcTransactionPlanner } from '../src';

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

describe('rpcTransactionPlanExecutor', () => {
    it('provides a transactionPlanExecutor on the client', () => {
        const rpc = {} as Rpc<SolanaRpcApi>;
        const rpcSubscriptions = {} as RpcSubscriptions<SolanaRpcSubscriptionsApi>;
        const client = createEmptyClient()
            .use(() => ({ rpc, rpcSubscriptions }))
            .use(rpcTransactionPlanExecutor());
        expect(client).toHaveProperty('transactionPlanExecutor');
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
            .use(rpcTransactionPlanner())
            .use(rpcTransactionPlanExecutor());

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
            .use(rpcTransactionPlanExecutor());

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

    it('sends with skipPreflight false when the transaction has an explicit compute unit limit', async () => {
        const payer = await generateKeyPairSigner();
        const getLatestBlockhash = vi.fn().mockResolvedValue({ value: MOCK_BLOCKHASH });
        const simulateTransaction = vi.fn();
        const rpc = {
            getLatestBlockhash: () => ({ send: getLatestBlockhash }),
            simulateTransaction: () => ({ send: simulateTransaction }),
        } as unknown as Rpc<SolanaRpcApi>;
        const rpcSubscriptions = {} as RpcSubscriptions<SolanaRpcSubscriptionsApi>;
        const sendAndConfirmTransaction = vi.fn().mockResolvedValue('MockTransactionSignature');
        (sendAndConfirmTransactionFactory as Mock).mockReturnValueOnce(sendAndConfirmTransaction);

        const client = createEmptyClient()
            .use(() => ({ payer, rpc, rpcSubscriptions }))
            .use(rpcTransactionPlanExecutor());

        // Create a transaction message with an explicit (non-provisory) compute unit limit.
        const txMessage = pipe(
            createTransactionMessage({ version: 0 }),
            tx => setTransactionMessageFeePayerSigner(payer, tx),
            tx => updateOrAppendSetComputeUnitLimitInstruction(500, tx),
        );
        await client.transactionPlanExecutor(singleTransactionPlan(txMessage));

        // No simulation should have been performed.
        expect(simulateTransaction).not.toHaveBeenCalled();

        // Preflight should run as the only simulation.
        expect(sendAndConfirmTransaction).toHaveBeenCalledExactlyOnceWith(expect.anything(), {
            commitment: 'confirmed',
            skipPreflight: false,
        });
    });

    it('sends with skipPreflight true when the transaction has an explicit compute unit limit and skipPreflight is true', async () => {
        const payer = await generateKeyPairSigner();
        const getLatestBlockhash = vi.fn().mockResolvedValue({ value: MOCK_BLOCKHASH });
        const simulateTransaction = vi.fn();
        const rpc = {
            getLatestBlockhash: () => ({ send: getLatestBlockhash }),
            simulateTransaction: () => ({ send: simulateTransaction }),
        } as unknown as Rpc<SolanaRpcApi>;
        const rpcSubscriptions = {} as RpcSubscriptions<SolanaRpcSubscriptionsApi>;
        const sendAndConfirmTransaction = vi.fn().mockResolvedValue('MockTransactionSignature');
        (sendAndConfirmTransactionFactory as Mock).mockReturnValueOnce(sendAndConfirmTransaction);

        const client = createEmptyClient()
            .use(() => ({ payer, rpc, rpcSubscriptions }))
            .use(rpcTransactionPlanExecutor({ skipPreflight: true }));

        // Create a transaction message with an explicit (non-provisory) compute unit limit.
        const txMessage = pipe(
            createTransactionMessage({ version: 0 }),
            tx => setTransactionMessageFeePayerSigner(payer, tx),
            tx => updateOrAppendSetComputeUnitLimitInstruction(500, tx),
        );
        await client.transactionPlanExecutor(singleTransactionPlan(txMessage));

        // No simulation should have been performed.
        expect(simulateTransaction).not.toHaveBeenCalled();

        // Preflight should also be skipped.
        expect(sendAndConfirmTransaction).toHaveBeenCalledExactlyOnceWith(expect.anything(), {
            commitment: 'confirmed',
            skipPreflight: true,
        });
    });

    it('throws when CU estimation simulation fails and skipPreflight is false', async () => {
        const payer = await generateKeyPairSigner();
        const getLatestBlockhash = vi.fn().mockResolvedValue({ value: MOCK_BLOCKHASH });
        const simulateTransaction = vi
            .fn()
            .mockResolvedValue({ value: { err: 'AccountNotFound', unitsConsumed: 200n } });
        const rpc = {
            getLatestBlockhash: () => ({ send: getLatestBlockhash }),
            simulateTransaction: () => ({ send: simulateTransaction }),
        } as unknown as Rpc<SolanaRpcApi>;
        const rpcSubscriptions = {} as RpcSubscriptions<SolanaRpcSubscriptionsApi>;
        const sendAndConfirmTransaction = vi.fn().mockResolvedValue('MockTransactionSignature');
        (sendAndConfirmTransactionFactory as Mock).mockReturnValueOnce(sendAndConfirmTransaction);

        const client = createEmptyClient()
            .use(() => ({ payer, rpc, rpcSubscriptions }))
            .use(rpcTransactionPlanExecutor());

        const txMessage = setTransactionMessageFeePayerSigner(payer, createTransactionMessage({ version: 0 }));
        const promise = client.transactionPlanExecutor(singleTransactionPlan(txMessage));

        // The executor should throw since skipPreflight is false.
        await expect(promise).rejects.toThrow();

        // The transaction should not have been sent.
        expect(sendAndConfirmTransaction).not.toHaveBeenCalled();
    });

    it('sends the transaction when CU estimation simulation fails and skipPreflight is true', async () => {
        const payer = await generateKeyPairSigner();
        const getLatestBlockhash = vi.fn().mockResolvedValue({ value: MOCK_BLOCKHASH });
        const simulateTransaction = vi
            .fn()
            .mockResolvedValue({ value: { err: 'AccountNotFound', unitsConsumed: 200n } });
        const rpc = {
            getLatestBlockhash: () => ({ send: getLatestBlockhash }),
            simulateTransaction: () => ({ send: simulateTransaction }),
        } as unknown as Rpc<SolanaRpcApi>;
        const rpcSubscriptions = {} as RpcSubscriptions<SolanaRpcSubscriptionsApi>;
        const sendAndConfirmTransaction = vi.fn().mockResolvedValue('MockTransactionSignature');
        (sendAndConfirmTransactionFactory as Mock).mockReturnValueOnce(sendAndConfirmTransaction);

        const client = createEmptyClient()
            .use(() => ({ payer, rpc, rpcSubscriptions }))
            .use(rpcTransactionPlanExecutor({ skipPreflight: true }));

        const txMessage = setTransactionMessageFeePayerSigner(payer, createTransactionMessage({ version: 0 }));
        await client.transactionPlanExecutor(singleTransactionPlan(txMessage));

        // The transaction should have been sent with skipPreflight true.
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
            .use(rpcTransactionPlanExecutor());

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
            .use(rpcTransactionPlanExecutor());

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
            .use(rpcTransactionPlanner())
            .use(rpcTransactionPlanExecutor({ maxConcurrency: 2 }));

        const singlePlan = await client.transactionPlanner(singleInstructionPlan(MOCK_INSTRUCTION));
        const transactionPlan = parallelTransactionPlan([singlePlan, singlePlan, singlePlan, singlePlan]);
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
                .use(rpcTransactionPlanExecutor()),
        ).toThrow();
    });

    it('requires an RPC Subscriptions API on the client', () => {
        const rpc = {} as Rpc<SolanaRpcApi>;
        expect(() =>
            createEmptyClient()
                .use(() => ({ rpc }))
                // @ts-expect-error Missing RPC Subscriptions on the client.
                .use(rpcTransactionPlanExecutor()),
        ).toThrow();
    });
});
