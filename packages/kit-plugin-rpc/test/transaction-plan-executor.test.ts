import {
    Address,
    address,
    createClient,
    createTransactionMessage,
    flattenTransactionPlanResult,
    generateKeyPairSigner,
    getBase64EncodedWireTransaction,
    getSignatureFromTransaction,
    getTransactionMessageComputeUnitLimit,
    isSolanaError,
    Nonce,
    nonDivisibleSequentialTransactionPlan,
    parallelTransactionPlan,
    pipe,
    Rpc,
    RpcSubscriptions,
    sendAndConfirmTransactionFactory,
    sequentialTransactionPlan,
    setTransactionMessageComputeUnitLimit,
    setTransactionMessageFeePayer,
    setTransactionMessageFeePayerSigner,
    setTransactionMessageLoadedAccountsDataSizeLimit,
    singleInstructionPlan,
    singleTransactionPlan,
    SingleTransactionPlanResult,
    SOLANA_ERROR__FAILED_TO_SIGN_TRANSACTIONS,
    SOLANA_ERROR__INVARIANT_VIOLATION__INVALID_TRANSACTION_PLAN_KIND,
    SolanaRpcApi,
    SolanaRpcSubscriptionsApi,
    TransactionPlan,
    TransactionPlanResult,
    Transaction,
    TransactionModifyingSigner,
    TransactionPartialSigner,
    TransactionSigner,
    TransactionWithinSizeLimit,
    TransactionWithLifetime,
} from '@solana/kit';
import { assert, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import {
    RpcSignContext,
    rpcTransactionPlanExecutor,
    rpcTransactionPlanner,
    rpcTransactionPlanSendingExecutor,
    rpcTransactionPlanSigningExecutor,
} from '../src';

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

describe('rpcTransactionPlanSendingExecutor', () => {
    it('adds sendTransaction and sendTransactions to the client', async () => {
        const payer = await generateKeyPairSigner();
        const rpc = {} as Rpc<SolanaRpcApi>;
        const rpcSubscriptions = {} as RpcSubscriptions<SolanaRpcSubscriptionsApi>;
        const client = createClient()
            .use(() => ({ payer, rpc, rpcSubscriptions }))
            .use(rpcTransactionPlanner())
            .use(rpcTransactionPlanSendingExecutor());
        expect(client).toHaveProperty('sendTransaction');
        expect(client).toHaveProperty('sendTransactions');
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

        const client = createClient()
            .use(() => ({ payer, rpc, rpcSubscriptions }))
            .use(rpcTransactionPlanner())
            .use(rpcTransactionPlanSendingExecutor());

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

    it('reports the signature and the transaction in the result context on success', async () => {
        const payer = await generateKeyPairSigner();
        const getLatestBlockhash = vi.fn().mockResolvedValue({ value: MOCK_BLOCKHASH });
        const simulateTransaction = vi.fn().mockResolvedValue({ value: { unitsConsumed: 42 } });
        const rpc = {
            getLatestBlockhash: () => ({ send: getLatestBlockhash }),
            simulateTransaction: () => ({ send: simulateTransaction }),
        } as unknown as Rpc<SolanaRpcApi>;
        const rpcSubscriptions = {} as RpcSubscriptions<SolanaRpcSubscriptionsApi>;
        (sendAndConfirmTransactionFactory as Mock).mockReturnValueOnce(vi.fn().mockResolvedValue(undefined));

        const client = createClient()
            .use(() => ({ payer, rpc, rpcSubscriptions }))
            .use(rpcTransactionPlanner())
            .use(rpcTransactionPlanSendingExecutor());

        const instructionPlan = singleInstructionPlan(MOCK_INSTRUCTION);
        const transactionPlan = await client.transactionPlanner(instructionPlan);
        const result = (await client.transactionPlanExecutor(transactionPlan)) as SingleTransactionPlanResult;
        expect(result.status).toBe('successful');
        expect(result.context.transaction).toBeDefined();
        expect(result.context.signature).toBe(getSignatureFromTransaction(result.context.transaction!));
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

        const client = createClient()
            .use(() => ({ payer, rpc, rpcSubscriptions }))
            .use(rpcTransactionPlanner())
            .use(rpcTransactionPlanSendingExecutor());

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

        const client = createClient()
            .use(() => ({ payer, rpc, rpcSubscriptions }))
            .use(rpcTransactionPlanner())
            .use(rpcTransactionPlanSendingExecutor());

        // Create a transaction message with an explicit (non-provisory) compute unit limit.
        const txMessage = pipe(
            createTransactionMessage({ version: 0 }),
            tx => setTransactionMessageFeePayerSigner(payer, tx),
            tx => setTransactionMessageComputeUnitLimit(500, tx),
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

        const client = createClient()
            .use(() => ({ payer, rpc, rpcSubscriptions }))
            .use(rpcTransactionPlanner())
            .use(rpcTransactionPlanSendingExecutor({ skipPreflight: true }));

        // Create a transaction message with an explicit (non-provisory) compute unit limit.
        const txMessage = pipe(
            createTransactionMessage({ version: 0 }),
            tx => setTransactionMessageFeePayerSigner(payer, tx),
            tx => setTransactionMessageComputeUnitLimit(500, tx),
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

        const client = createClient()
            .use(() => ({ payer, rpc, rpcSubscriptions }))
            .use(rpcTransactionPlanner())
            .use(rpcTransactionPlanSendingExecutor());

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

        const client = createClient()
            .use(() => ({ payer, rpc, rpcSubscriptions }))
            .use(rpcTransactionPlanner())
            .use(rpcTransactionPlanSendingExecutor({ skipPreflight: true }));

        const txMessage = setTransactionMessageFeePayerSigner(payer, createTransactionMessage({ version: 0 }));
        await client.transactionPlanExecutor(singleTransactionPlan(txMessage));

        // The transaction should have been sent with skipPreflight true.
        expect(sendAndConfirmTransaction).toHaveBeenCalledExactlyOnceWith(expect.anything(), {
            commitment: 'confirmed',
            skipPreflight: true,
        });
    });

    it('estimates the loaded accounts data size for version 1 transactions', async () => {
        const payer = await generateKeyPairSigner();
        const getLatestBlockhash = vi.fn().mockResolvedValue({ value: MOCK_BLOCKHASH });
        // A version 1 transaction requires the simulation to return a loaded accounts data size.
        const simulateTransaction = vi
            .fn()
            .mockResolvedValue({ value: { loadedAccountsDataSize: 5000, unitsConsumed: 42n } });
        const rpc = {
            getLatestBlockhash: () => ({ send: getLatestBlockhash }),
            simulateTransaction: () => ({ send: simulateTransaction }),
        } as unknown as Rpc<SolanaRpcApi>;
        const rpcSubscriptions = {} as RpcSubscriptions<SolanaRpcSubscriptionsApi>;
        const sendAndConfirmTransaction = vi.fn().mockResolvedValue('MockTransactionSignature');
        (sendAndConfirmTransactionFactory as Mock).mockReturnValueOnce(sendAndConfirmTransaction);

        const client = createClient()
            .use(() => ({ payer, rpc, rpcSubscriptions }))
            .use(rpcTransactionPlanner())
            .use(rpcTransactionPlanSendingExecutor());

        const txMessage = setTransactionMessageFeePayerSigner(payer, createTransactionMessage({ version: 1 }));
        await client.transactionPlanExecutor(singleTransactionPlan(txMessage));

        // Estimation runs a single simulation, so preflight is skipped when sending.
        expect(simulateTransaction).toHaveBeenCalledOnce();
        expect(sendAndConfirmTransaction).toHaveBeenCalledExactlyOnceWith(expect.anything(), {
            commitment: 'confirmed',
            skipPreflight: true,
        });
    });

    it('throws when a version 1 transaction simulation omits the loaded accounts data size', async () => {
        const payer = await generateKeyPairSigner();
        const getLatestBlockhash = vi.fn().mockResolvedValue({ value: MOCK_BLOCKHASH });
        // The RPC omits `loadedAccountsDataSize`, which is required for version 1 transactions.
        const simulateTransaction = vi.fn().mockResolvedValue({ value: { unitsConsumed: 42n } });
        const rpc = {
            getLatestBlockhash: () => ({ send: getLatestBlockhash }),
            simulateTransaction: () => ({ send: simulateTransaction }),
        } as unknown as Rpc<SolanaRpcApi>;
        const rpcSubscriptions = {} as RpcSubscriptions<SolanaRpcSubscriptionsApi>;
        const sendAndConfirmTransaction = vi.fn().mockResolvedValue('MockTransactionSignature');
        (sendAndConfirmTransactionFactory as Mock).mockReturnValueOnce(sendAndConfirmTransaction);

        const client = createClient()
            .use(() => ({ payer, rpc, rpcSubscriptions }))
            // Even with skipPreflight, a missing data size cannot be recovered.
            .use(rpcTransactionPlanner())
            .use(rpcTransactionPlanSendingExecutor({ skipPreflight: true }));

        const txMessage = setTransactionMessageFeePayerSigner(payer, createTransactionMessage({ version: 1 }));
        const promise = client.transactionPlanExecutor(singleTransactionPlan(txMessage));

        await expect(promise).rejects.toThrow();
        expect(sendAndConfirmTransaction).not.toHaveBeenCalled();
    });

    it('recovers the loaded accounts data size for version 1 transactions when estimation fails and skipPreflight is true', async () => {
        const payer = await generateKeyPairSigner();
        const getLatestBlockhash = vi.fn().mockResolvedValue({ value: MOCK_BLOCKHASH });
        // The estimation simulation fails, but still reports the consumed resources,
        // including the loaded accounts data size required for version 1 transactions.
        const simulateTransaction = vi.fn().mockResolvedValue({
            value: { err: 'AccountNotFound', loadedAccountsDataSize: 5000, unitsConsumed: 200n },
        });
        const rpc = {
            getLatestBlockhash: () => ({ send: getLatestBlockhash }),
            simulateTransaction: () => ({ send: simulateTransaction }),
        } as unknown as Rpc<SolanaRpcApi>;
        const rpcSubscriptions = {} as RpcSubscriptions<SolanaRpcSubscriptionsApi>;
        const sendAndConfirmTransaction = vi.fn().mockResolvedValue('MockTransactionSignature');
        (sendAndConfirmTransactionFactory as Mock).mockReturnValueOnce(sendAndConfirmTransaction);

        const client = createClient()
            .use(() => ({ payer, rpc, rpcSubscriptions }))
            .use(rpcTransactionPlanner())
            .use(rpcTransactionPlanSendingExecutor({ skipPreflight: true }));

        const txMessage = setTransactionMessageFeePayerSigner(payer, createTransactionMessage({ version: 1 }));
        await client.transactionPlanExecutor(singleTransactionPlan(txMessage));

        // The recovered limits let the transaction reach the validator with preflight skipped.
        expect(sendAndConfirmTransaction).toHaveBeenCalledExactlyOnceWith(expect.anything(), {
            commitment: 'confirmed',
            skipPreflight: true,
        });
    });

    it('does not simulate when a version 1 transaction already has explicit resource limits', async () => {
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

        const client = createClient()
            .use(() => ({ payer, rpc, rpcSubscriptions }))
            .use(rpcTransactionPlanner())
            .use(rpcTransactionPlanSendingExecutor());

        // Both applicable resource limits are explicit, so no estimation is needed.
        const txMessage = pipe(
            createTransactionMessage({ version: 1 }),
            tx => setTransactionMessageFeePayerSigner(payer, tx),
            tx => setTransactionMessageComputeUnitLimit(500, tx),
            tx => setTransactionMessageLoadedAccountsDataSizeLimit(5000, tx),
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

    it('does not simulate to estimate when resource limit estimation is disabled', async () => {
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

        const client = createClient()
            .use(() => ({ payer, rpc, rpcSubscriptions }))
            .use(rpcTransactionPlanner({ estimateResourceLimits: false }))
            .use(rpcTransactionPlanSendingExecutor({ estimateResourceLimits: false }));

        const transactionPlan = await client.transactionPlanner(singleInstructionPlan(MOCK_INSTRUCTION));
        await client.transactionPlanExecutor(transactionPlan);

        // No estimation simulation should have been performed.
        expect(simulateTransaction).not.toHaveBeenCalled();

        // Preflight runs as the only simulation, so it is not skipped.
        expect(sendAndConfirmTransaction).toHaveBeenCalledExactlyOnceWith(expect.anything(), {
            commitment: 'confirmed',
            skipPreflight: false,
        });
    });

    it('performs no simulation when estimation is disabled and preflight is skipped', async () => {
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

        const client = createClient()
            .use(() => ({ payer, rpc, rpcSubscriptions }))
            .use(rpcTransactionPlanner({ estimateResourceLimits: false }))
            .use(rpcTransactionPlanSendingExecutor({ estimateResourceLimits: false, skipPreflight: true }));

        const transactionPlan = await client.transactionPlanner(singleInstructionPlan(MOCK_INSTRUCTION));
        await client.transactionPlanExecutor(transactionPlan);

        // No estimation simulation and no preflight: zero simulations overall.
        expect(simulateTransaction).not.toHaveBeenCalled();
        expect(sendAndConfirmTransaction).toHaveBeenCalledExactlyOnceWith(expect.anything(), {
            commitment: 'confirmed',
            skipPreflight: true,
        });
    });

    it('adds the minimum compute unit buffer of 300 to a small estimate', async () => {
        const payer = await generateKeyPairSigner();
        const getLatestBlockhash = vi.fn().mockResolvedValue({ value: MOCK_BLOCKHASH });
        // A tiny estimate whose percentage margin (42 * ~0.1 = 5) is below the
        // 300 buffer floor, so the flat 300 buffer is added instead: 42 + 300.
        const simulateTransaction = vi.fn().mockResolvedValue({ value: { unitsConsumed: 42n } });
        const rpc = {
            getLatestBlockhash: () => ({ send: getLatestBlockhash }),
            simulateTransaction: () => ({ send: simulateTransaction }),
        } as unknown as Rpc<SolanaRpcApi>;
        const rpcSubscriptions = {} as RpcSubscriptions<SolanaRpcSubscriptionsApi>;
        const sendAndConfirmTransaction = vi.fn().mockResolvedValue('MockTransactionSignature');
        (sendAndConfirmTransactionFactory as Mock).mockReturnValueOnce(sendAndConfirmTransaction);

        const client = createClient()
            .use(() => ({ payer, rpc, rpcSubscriptions }))
            .use(rpcTransactionPlanner())
            .use(rpcTransactionPlanSendingExecutor());

        const txMessage = setTransactionMessageFeePayerSigner(payer, createTransactionMessage({ version: 0 }));
        const result = (await client.transactionPlanExecutor(
            singleTransactionPlan(txMessage),
        )) as SingleTransactionPlanResult;

        expect(getTransactionMessageComputeUnitLimit(result.context.message!)).toBe(342);
    });

    it('adds the minimum compute unit buffer when the percentage margin is below 300', async () => {
        const payer = await generateKeyPairSigner();
        const getLatestBlockhash = vi.fn().mockResolvedValue({ value: MOCK_BLOCKHASH });
        // 1,000 CU sits in the decaying region but its margin (1,000 * ~0.09984
        // = 100) is below the 300 buffer floor, so the flat 300 buffer wins:
        // 1,000 + 300 = 1,300.
        const simulateTransaction = vi.fn().mockResolvedValue({ value: { unitsConsumed: 1_000n } });
        const rpc = {
            getLatestBlockhash: () => ({ send: getLatestBlockhash }),
            simulateTransaction: () => ({ send: simulateTransaction }),
        } as unknown as Rpc<SolanaRpcApi>;
        const rpcSubscriptions = {} as RpcSubscriptions<SolanaRpcSubscriptionsApi>;
        const sendAndConfirmTransaction = vi.fn().mockResolvedValue('MockTransactionSignature');
        (sendAndConfirmTransactionFactory as Mock).mockReturnValueOnce(sendAndConfirmTransaction);

        const client = createClient()
            .use(() => ({ payer, rpc, rpcSubscriptions }))
            .use(rpcTransactionPlanner())
            .use(rpcTransactionPlanSendingExecutor());

        const txMessage = setTransactionMessageFeePayerSigner(payer, createTransactionMessage({ version: 0 }));
        const result = (await client.transactionPlanExecutor(
            singleTransactionPlan(txMessage),
        )) as SingleTransactionPlanResult;

        expect(getTransactionMessageComputeUnitLimit(result.context.message!)).toBe(1_300);
    });

    it('applies the default compute unit buffer to a mid-range estimate', async () => {
        const payer = await generateKeyPairSigner();
        const getLatestBlockhash = vi.fn().mockResolvedValue({ value: MOCK_BLOCKHASH });
        // 50,000 CU sits in the decaying region: margin = 0.1 - 0.08 * (50000 / 500000) = 0.092.
        // The percentage buffer (50,000 * 0.092 = 4,600) exceeds the 300 floor,
        // so it wins: 50,000 + 4,600 = 54,600.
        const simulateTransaction = vi.fn().mockResolvedValue({ value: { unitsConsumed: 50_000n } });
        const rpc = {
            getLatestBlockhash: () => ({ send: getLatestBlockhash }),
            simulateTransaction: () => ({ send: simulateTransaction }),
        } as unknown as Rpc<SolanaRpcApi>;
        const rpcSubscriptions = {} as RpcSubscriptions<SolanaRpcSubscriptionsApi>;
        const sendAndConfirmTransaction = vi.fn().mockResolvedValue('MockTransactionSignature');
        (sendAndConfirmTransactionFactory as Mock).mockReturnValueOnce(sendAndConfirmTransaction);

        const client = createClient()
            .use(() => ({ payer, rpc, rpcSubscriptions }))
            .use(rpcTransactionPlanner())
            .use(rpcTransactionPlanSendingExecutor());

        const txMessage = setTransactionMessageFeePayerSigner(payer, createTransactionMessage({ version: 0 }));
        const result = (await client.transactionPlanExecutor(
            singleTransactionPlan(txMessage),
        )) as SingleTransactionPlanResult;

        expect(getTransactionMessageComputeUnitLimit(result.context.message!)).toBe(54_600);
    });

    it('uses a custom getComputeUnitLimitFromEstimate function when provided', async () => {
        const payer = await generateKeyPairSigner();
        const getLatestBlockhash = vi.fn().mockResolvedValue({ value: MOCK_BLOCKHASH });
        const simulateTransaction = vi.fn().mockResolvedValue({ value: { unitsConsumed: 1_000n } });
        const rpc = {
            getLatestBlockhash: () => ({ send: getLatestBlockhash }),
            simulateTransaction: () => ({ send: simulateTransaction }),
        } as unknown as Rpc<SolanaRpcApi>;
        const rpcSubscriptions = {} as RpcSubscriptions<SolanaRpcSubscriptionsApi>;
        const sendAndConfirmTransaction = vi.fn().mockResolvedValue('MockTransactionSignature');
        (sendAndConfirmTransactionFactory as Mock).mockReturnValueOnce(sendAndConfirmTransaction);

        const getComputeUnitLimitFromEstimate = vi.fn((estimatedComputeUnits: number) => estimatedComputeUnits * 2);
        const client = createClient()
            .use(() => ({ payer, rpc, rpcSubscriptions }))
            .use(rpcTransactionPlanner())
            .use(rpcTransactionPlanSendingExecutor({ getComputeUnitLimitFromEstimate }));

        const txMessage = setTransactionMessageFeePayerSigner(payer, createTransactionMessage({ version: 0 }));
        const result = (await client.transactionPlanExecutor(
            singleTransactionPlan(txMessage),
        )) as SingleTransactionPlanResult;

        // The custom function receives the raw estimate and its result is used verbatim.
        expect(getComputeUnitLimitFromEstimate).toHaveBeenCalledWith(1_000);
        expect(getTransactionMessageComputeUnitLimit(result.context.message!)).toBe(2_000);
    });

    it('applies the compute unit buffer on the recovery path when estimation fails and skipPreflight is true', async () => {
        const payer = await generateKeyPairSigner();
        const getLatestBlockhash = vi.fn().mockResolvedValue({ value: MOCK_BLOCKHASH });
        // The estimation simulation fails but reports the consumed units.
        const simulateTransaction = vi
            .fn()
            .mockResolvedValue({ value: { err: 'AccountNotFound', unitsConsumed: 50_000n } });
        const rpc = {
            getLatestBlockhash: () => ({ send: getLatestBlockhash }),
            simulateTransaction: () => ({ send: simulateTransaction }),
        } as unknown as Rpc<SolanaRpcApi>;
        const rpcSubscriptions = {} as RpcSubscriptions<SolanaRpcSubscriptionsApi>;
        const sendAndConfirmTransaction = vi.fn().mockResolvedValue('MockTransactionSignature');
        (sendAndConfirmTransactionFactory as Mock).mockReturnValueOnce(sendAndConfirmTransaction);

        const client = createClient()
            .use(() => ({ payer, rpc, rpcSubscriptions }))
            .use(rpcTransactionPlanner())
            .use(rpcTransactionPlanSendingExecutor({ skipPreflight: true }));

        const txMessage = setTransactionMessageFeePayerSigner(payer, createTransactionMessage({ version: 0 }));
        const result = (await client.transactionPlanExecutor(
            singleTransactionPlan(txMessage),
        )) as SingleTransactionPlanResult;

        // The recovered 50,000 CU is buffered the same way as a successful estimate.
        expect(getTransactionMessageComputeUnitLimit(result.context.message!)).toBe(54_600);
    });

    it('caps the default buffered compute unit limit at the per-transaction maximum', async () => {
        const payer = await generateKeyPairSigner();
        const getLatestBlockhash = vi.fn().mockResolvedValue({ value: MOCK_BLOCKHASH });
        // 1,390,000 CU buffered by 2% would be ~1,417,800, above the 1,400,000 max.
        const simulateTransaction = vi.fn().mockResolvedValue({ value: { unitsConsumed: 1_390_000n } });
        const rpc = {
            getLatestBlockhash: () => ({ send: getLatestBlockhash }),
            simulateTransaction: () => ({ send: simulateTransaction }),
        } as unknown as Rpc<SolanaRpcApi>;
        const rpcSubscriptions = {} as RpcSubscriptions<SolanaRpcSubscriptionsApi>;
        const sendAndConfirmTransaction = vi.fn().mockResolvedValue('MockTransactionSignature');
        (sendAndConfirmTransactionFactory as Mock).mockReturnValueOnce(sendAndConfirmTransaction);

        const client = createClient()
            .use(() => ({ payer, rpc, rpcSubscriptions }))
            .use(rpcTransactionPlanner())
            .use(rpcTransactionPlanSendingExecutor());

        const txMessage = setTransactionMessageFeePayerSigner(payer, createTransactionMessage({ version: 0 }));
        const result = (await client.transactionPlanExecutor(
            singleTransactionPlan(txMessage),
        )) as SingleTransactionPlanResult;

        expect(getTransactionMessageComputeUnitLimit(result.context.message!)).toBe(1_400_000);
    });

    it('caps a custom getComputeUnitLimitFromEstimate result at the per-transaction maximum', async () => {
        const payer = await generateKeyPairSigner();
        const getLatestBlockhash = vi.fn().mockResolvedValue({ value: MOCK_BLOCKHASH });
        const simulateTransaction = vi.fn().mockResolvedValue({ value: { unitsConsumed: 1_000n } });
        const rpc = {
            getLatestBlockhash: () => ({ send: getLatestBlockhash }),
            simulateTransaction: () => ({ send: simulateTransaction }),
        } as unknown as Rpc<SolanaRpcApi>;
        const rpcSubscriptions = {} as RpcSubscriptions<SolanaRpcSubscriptionsApi>;
        const sendAndConfirmTransaction = vi.fn().mockResolvedValue('MockTransactionSignature');
        (sendAndConfirmTransactionFactory as Mock).mockReturnValueOnce(sendAndConfirmTransaction);

        const client = createClient()
            .use(() => ({ payer, rpc, rpcSubscriptions }))
            // A custom function that returns an out-of-range value must still be capped.
            .use(rpcTransactionPlanner())
            .use(rpcTransactionPlanSendingExecutor({ getComputeUnitLimitFromEstimate: () => 2_000_000 }));

        const txMessage = setTransactionMessageFeePayerSigner(payer, createTransactionMessage({ version: 0 }));
        const result = (await client.transactionPlanExecutor(
            singleTransactionPlan(txMessage),
        )) as SingleTransactionPlanResult;

        expect(getTransactionMessageComputeUnitLimit(result.context.message!)).toBe(1_400_000);
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

        const client = createClient()
            .use(() => ({ payer, rpc, rpcSubscriptions }))
            .use(rpcTransactionPlanner())
            .use(rpcTransactionPlanSendingExecutor({ maxConcurrency: 2 }));

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
            createClient()
                .use(() => ({ rpcSubscriptions }))
                // @ts-expect-error Missing RPC on the client.
                .use(rpcTransactionPlanSendingExecutor()),
        ).toThrow();
    });

    it('requires an RPC Subscriptions API on the client', () => {
        const rpc = {} as Rpc<SolanaRpcApi>;
        expect(() =>
            createClient()
                .use(() => ({ rpc }))
                // @ts-expect-error Missing RPC Subscriptions on the client.
                .use(rpcTransactionPlanSendingExecutor()),
        ).toThrow();
    });
});

describe('rpcTransactionPlanSigningExecutor', () => {
    it('does not request a blockhash for an empty plan', async () => {
        const payer = await generateKeyPairSigner();
        const getLatestBlockhash = vi.fn().mockRejectedValue(new Error('RPC unavailable'));
        const rpc = {
            getLatestBlockhash: () => ({ send: getLatestBlockhash }),
            simulateTransaction: () => ({ send: vi.fn() }),
        } as unknown as Rpc<SolanaRpcApi>;
        const client = createClient()
            .use(() => ({ payer, rpc }))
            .use(rpcTransactionPlanner())
            .use(rpcTransactionPlanSigningExecutor());

        await expect(client.signTransactions([])).resolves.toBeDefined();

        expect(getLatestBlockhash).not.toHaveBeenCalled();
    });

    it('rejects an unknown nested transaction plan kind with an invariant error', async () => {
        const payer = await generateKeyPairSigner();
        const getLatestBlockhash = vi.fn();
        const rpc = {
            getLatestBlockhash: () => ({ send: getLatestBlockhash }),
            simulateTransaction: () => ({ send: vi.fn() }),
        } as unknown as Rpc<SolanaRpcApi>;
        const client = createClient()
            .use(() => ({ payer, rpc }))
            .use(rpcTransactionPlanner())
            .use(rpcTransactionPlanSigningExecutor());
        const malformedPlan = parallelTransactionPlan([{ kind: 'unknown' } as unknown as TransactionPlan]);

        const error = await client.signTransactions(malformedPlan).catch((error: unknown) => error);

        expect(isSolanaError(error, SOLANA_ERROR__INVARIANT_VIOLATION__INVALID_TRANSACTION_PLAN_KIND)).toBe(true);
        expect(getLatestBlockhash).not.toHaveBeenCalled();
    });

    it('adds signing functions and returns a signed transaction with its prepared message and signature', async () => {
        const payer = await generateKeyPairSigner();
        const getLatestBlockhash = vi.fn().mockResolvedValue({ value: MOCK_BLOCKHASH });
        const simulateTransaction = vi.fn().mockResolvedValue({ value: { unitsConsumed: 42n } });
        const rpc = {
            getLatestBlockhash: () => ({ send: getLatestBlockhash }),
            simulateTransaction: () => ({ send: simulateTransaction }),
        } as unknown as Rpc<SolanaRpcApi>;
        const client = createClient()
            .use(() => ({ payer, rpc }))
            .use(rpcTransactionPlanner())
            .use(rpcTransactionPlanSigningExecutor());

        expect(client.signTransaction).toBeTypeOf('function');
        expect(client.signTransactions).toBeTypeOf('function');
        expect(client).not.toHaveProperty('sendTransaction');
        expect(client).not.toHaveProperty('transactionPlanExecutor');

        const result = await client.signTransaction(singleInstructionPlan(MOCK_INSTRUCTION));

        expect(result.context.message.lifetimeConstraint).toEqual(MOCK_BLOCKHASH);
        expect(getTransactionMessageComputeUnitLimit(result.context.message)).toBe(342);
        expect(result.context.transaction).toBeDefined();
        expect(result.context.transactionBase64).toBe(getBase64EncodedWireTransaction(result.context.transaction));
        expect(result.context.signature).toBe(getSignatureFromTransaction(result.context.transaction));
        expect(getLatestBlockhash).toHaveBeenCalledOnce();
        expect(simulateTransaction).toHaveBeenCalledOnce();
        expect(sendAndConfirmTransactionFactory).not.toHaveBeenCalled();
    });

    it('returns a partially signed transaction without a signature when the fee payer did not sign', async () => {
        const payer = await generateKeyPairSigner();
        const unsignedFeePayer = address('11111111111111111111111111111111');
        const getLatestBlockhash = vi.fn().mockResolvedValue({ value: MOCK_BLOCKHASH });
        const simulateTransaction = vi.fn();
        const rpc = {
            getLatestBlockhash: () => ({ send: getLatestBlockhash }),
            simulateTransaction: () => ({ send: simulateTransaction }),
        } as unknown as Rpc<SolanaRpcApi>;
        const client = createClient()
            .use(() => ({ payer, rpc }))
            .use(rpcTransactionPlanner({ estimateResourceLimits: false }))
            .use(rpcTransactionPlanSigningExecutor({ estimateResourceLimits: false }));
        const message = setTransactionMessageFeePayer(unsignedFeePayer, createTransactionMessage({ version: 0 }));

        const result = await client.signTransaction(message);

        expect(result.context.transaction.signatures[unsignedFeePayer]).toBeNull();
        expect(result.context.transactionBase64).toBe(getBase64EncodedWireTransaction(result.context.transaction));
        expect(result.context.signature).toBeUndefined();
        expect(simulateTransaction).not.toHaveBeenCalled();
    });

    it('preserves a lifetime changed by a transaction-modifying signer', async () => {
        const nonceAccountAddress = address('11111111111111111111111111111111');
        const lifetimeConstraint = {
            nonce: MOCK_BLOCKHASH.blockhash as Nonce,
            nonceAccountAddress,
        };
        const modifyingPayer = {
            address: nonceAccountAddress,
            modifyAndSignTransactions: vi.fn(
                (transactions: readonly (Transaction | (Transaction & TransactionWithLifetime))[]) =>
                    Promise.resolve(
                        transactions.map(
                            transaction =>
                                ({
                                    ...transaction,
                                    lifetimeConstraint,
                                }) as Transaction & TransactionWithinSizeLimit & TransactionWithLifetime,
                        ),
                    ),
            ),
        } satisfies TransactionModifyingSigner;
        const getLatestBlockhash = vi.fn().mockResolvedValue({ value: MOCK_BLOCKHASH });
        const rpc = {
            getLatestBlockhash: () => ({ send: getLatestBlockhash }),
            simulateTransaction: () => ({ send: vi.fn() }),
        } as unknown as Rpc<SolanaRpcApi>;
        const client = createClient()
            .use(() => ({ payer: modifyingPayer, rpc }))
            .use(rpcTransactionPlanner({ estimateResourceLimits: false }))
            .use(rpcTransactionPlanSigningExecutor({ estimateResourceLimits: false }));
        const message = setTransactionMessageFeePayerSigner(modifyingPayer, createTransactionMessage({ version: 0 }));

        const result = await client.signTransaction(message);

        expect(result.context.message.lifetimeConstraint).toEqual(MOCK_BLOCKHASH);
        expect(result.context.transaction.lifetimeConstraint).toEqual(lifetimeConstraint);
        expect(modifyingPayer.modifyAndSignTransactions).toHaveBeenCalledOnce();
    });

    it('preserves nested transaction plan shape while signing all leaves with one blockhash', async () => {
        const payer = await generateKeyPairSigner();
        const getLatestBlockhash = vi.fn().mockResolvedValue({ value: MOCK_BLOCKHASH });
        const rpc = {
            getLatestBlockhash: () => ({ send: getLatestBlockhash }),
            simulateTransaction: () => ({ send: vi.fn() }),
        } as unknown as Rpc<SolanaRpcApi>;
        const client = createClient()
            .use(() => ({ payer, rpc }))
            .use(rpcTransactionPlanner({ estimateResourceLimits: false }))
            .use(rpcTransactionPlanSigningExecutor({ estimateResourceLimits: false }));
        const message = setTransactionMessageFeePayerSigner(payer, createTransactionMessage({ version: 0 }));
        const transactionPlan = parallelTransactionPlan([
            nonDivisibleSequentialTransactionPlan([message, message]),
            sequentialTransactionPlan([message, message]),
        ]);

        const result = await client.signTransactions(transactionPlan);

        expect(result.kind).toBe('parallel');
        assert(result.kind === 'parallel');
        expect(result.plans[0]).toMatchObject({ divisible: false, kind: 'sequential' });
        expect(result.plans[1]).toMatchObject({ divisible: true, kind: 'sequential' });
        expect(flattenTransactionPlanResult(result)).toHaveLength(4);
        expect(flattenTransactionPlanResult(result).every(leaf => leaf.status === 'successful')).toBe(true);
        expect(getLatestBlockhash).toHaveBeenCalledOnce();
    });

    it('shares the transaction concurrency limit across simultaneous signing calls', async () => {
        const keyPairPayer = await generateKeyPairSigner();
        let signingCalls = 0;
        const signingResolvers: Array<() => void> = [];
        const payer: TransactionPartialSigner = {
            address: keyPairPayer.address,
            signTransactions(transactions, config) {
                signingCalls++;
                return new Promise((resolve, reject) => {
                    signingResolvers.push(() => {
                        void keyPairPayer.signTransactions(transactions, config).then(resolve, reject);
                    });
                });
            },
        };
        const getLatestBlockhash = vi.fn().mockResolvedValue({ value: MOCK_BLOCKHASH });
        const simulateTransaction = vi.fn().mockResolvedValue({ value: { unitsConsumed: 42n } });
        const rpc = {
            getLatestBlockhash: () => ({ send: getLatestBlockhash }),
            simulateTransaction: () => ({ send: simulateTransaction }),
        } as unknown as Rpc<SolanaRpcApi>;
        const client = createClient()
            .use(() => ({ payer, rpc }))
            .use(rpcTransactionPlanner())
            .use(rpcTransactionPlanSigningExecutor({ maxConcurrency: 2 }));
        const singlePlan = await client.planTransactions(singleInstructionPlan(MOCK_INSTRUCTION));
        const transactionPlan = sequentialTransactionPlan([singlePlan, singlePlan]);

        const firstPromise = client.signTransactions(transactionPlan);
        const secondPromise = client.signTransactions(transactionPlan);

        await vi.waitFor(() => expect(signingCalls).toBe(2));
        expect(simulateTransaction).toHaveBeenCalledTimes(2);
        signingResolvers[0]();
        await vi.waitFor(() => expect(signingCalls).toBe(3));
        expect(simulateTransaction).toHaveBeenCalledTimes(3);
        signingResolvers[1]();
        await vi.waitFor(() => expect(signingCalls).toBe(4));
        expect(simulateTransaction).toHaveBeenCalledTimes(4);
        signingResolvers[2]();
        signingResolvers[3]();
        await Promise.all([firstPromise, secondPromise]);
        expect(getLatestBlockhash).toHaveBeenCalledTimes(2);
    });

    it('does not prepare or sign queued leaves after the abort signal fires', async () => {
        const keyPairPayer = await generateKeyPairSigner();
        let signingCalls = 0;
        const signingReleasers: Array<() => void> = [];
        const payer: TransactionPartialSigner = {
            address: keyPairPayer.address,
            signTransactions() {
                signingCalls++;
                return new Promise((_resolve, reject) => {
                    signingReleasers.push(() => reject(new Error('released')));
                });
            },
        };
        const getLatestBlockhash = vi.fn().mockResolvedValue({ value: MOCK_BLOCKHASH });
        const simulateTransaction = vi.fn().mockResolvedValue({ value: { unitsConsumed: 42n } });
        const rpc = {
            getLatestBlockhash: () => ({ send: getLatestBlockhash }),
            simulateTransaction: () => ({ send: simulateTransaction }),
        } as unknown as Rpc<SolanaRpcApi>;
        const client = createClient()
            .use(() => ({ payer, rpc }))
            .use(rpcTransactionPlanner())
            .use(rpcTransactionPlanSigningExecutor({ maxConcurrency: 1 }));
        const singlePlan = await client.planTransactions(singleInstructionPlan(MOCK_INSTRUCTION));
        const transactionPlan = sequentialTransactionPlan([singlePlan, singlePlan]);
        const abortController = new AbortController();

        const pendingError = client
            .signTransactions(transactionPlan, { abortSignal: abortController.signal })
            .catch((error: unknown) => error);
        await vi.waitFor(() => expect(signingCalls).toBe(1));
        abortController.abort();
        const error = await pendingError;
        assert(isSolanaError(error, SOLANA_ERROR__FAILED_TO_SIGN_TRANSACTIONS));

        // Free the concurrency slot held by the first leaf so the queued second
        // leaf gets its turn, then verify it bails out without doing any work.
        signingReleasers[0]();
        await new Promise(resolve => setTimeout(resolve, 0));
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(signingCalls).toBe(1);
        expect(simulateTransaction).toHaveBeenCalledOnce();
    });

    it('attempts every sequential leaf and reports successful siblings when one signer fails', async () => {
        const payer = await generateKeyPairSigner();
        const signingError = new Error('signing failed');
        const failingPayer = {
            address: address('11111111111111111111111111111111'),
            signTransactions: vi.fn().mockRejectedValue(signingError),
        } satisfies TransactionSigner;
        const getLatestBlockhash = vi.fn().mockResolvedValue({ value: MOCK_BLOCKHASH });
        const rpc = {
            getLatestBlockhash: () => ({ send: getLatestBlockhash }),
            simulateTransaction: () => ({ send: vi.fn() }),
        } as unknown as Rpc<SolanaRpcApi>;
        const client = createClient()
            .use(() => ({ payer, rpc }))
            .use(rpcTransactionPlanner({ estimateResourceLimits: false }))
            .use(rpcTransactionPlanSigningExecutor({ estimateResourceLimits: false }));
        const failingMessage = setTransactionMessageFeePayerSigner(
            failingPayer,
            createTransactionMessage({ version: 0 }),
        );
        const successfulMessage = setTransactionMessageFeePayerSigner(payer, createTransactionMessage({ version: 0 }));
        const transactionPlan = sequentialTransactionPlan([failingMessage, successfulMessage]);

        const error = await client.signTransactions(transactionPlan).catch((error: unknown) => error);

        assert(isSolanaError(error, SOLANA_ERROR__FAILED_TO_SIGN_TRANSACTIONS));
        const result = (error.context as { transactionPlanResult: TransactionPlanResult<RpcSignContext> })
            .transactionPlanResult;
        expect(flattenTransactionPlanResult(result).map(leaf => leaf.status)).toEqual(['failed', 'successful']);
        expect(failingPayer.signTransactions).toHaveBeenCalledOnce();
    });

    it('preserves the context recorded before a signer failure on the failed result', async () => {
        const signingError = new Error('signing failed');
        const failingPayer = {
            address: address('11111111111111111111111111111111'),
            signTransactions: vi.fn().mockRejectedValue(signingError),
        } satisfies TransactionSigner;
        const getLatestBlockhash = vi.fn().mockResolvedValue({ value: MOCK_BLOCKHASH });
        const simulateTransaction = vi.fn().mockResolvedValue({ value: { unitsConsumed: 42n } });
        const rpc = {
            getLatestBlockhash: () => ({ send: getLatestBlockhash }),
            simulateTransaction: () => ({ send: simulateTransaction }),
        } as unknown as Rpc<SolanaRpcApi>;
        const client = createClient()
            .use(() => ({ payer: failingPayer, rpc }))
            .use(rpcTransactionPlanner({ estimateResourceLimits: false }))
            .use(rpcTransactionPlanSigningExecutor());
        const message = setTransactionMessageFeePayerSigner(failingPayer, createTransactionMessage({ version: 0 }));

        const error = await client.signTransactions(message).catch((error: unknown) => error);

        assert(isSolanaError(error, SOLANA_ERROR__FAILED_TO_SIGN_TRANSACTIONS));
        const result = (error.context as { transactionPlanResult: TransactionPlanResult<RpcSignContext> })
            .transactionPlanResult;
        const [failedLeaf] = flattenTransactionPlanResult(result);
        assert(failedLeaf.status === 'failed');
        expect(failedLeaf.error).toBe(signingError);
        expect(failedLeaf.context.message?.lifetimeConstraint).toEqual(MOCK_BLOCKHASH);
        expect(getTransactionMessageComputeUnitLimit(failedLeaf.context.message!)).toBe(342);
        expect(failedLeaf.context.transaction).toBeUndefined();
        expect(failedLeaf.context.transactionBase64).toBeUndefined();
        expect(failedLeaf.context.signature).toBeUndefined();
    });

    it('requires an RPC API on the client', async () => {
        const payer = await generateKeyPairSigner();
        expect(() =>
            createClient()
                .use(() => ({ payer }))
                .use(rpcTransactionPlanner())
                // @ts-expect-error Missing RPC on the client.
                .use(rpcTransactionPlanSigningExecutor()),
        ).toThrow(/An RPC instance is required/);
    });
});

describe('rpcTransactionPlanExecutor', () => {
    it('sets the deprecated transactionPlanExecutor field without requiring a planner', () => {
        const rpc = {} as Rpc<SolanaRpcApi>;
        const rpcSubscriptions = {} as RpcSubscriptions<SolanaRpcSubscriptionsApi>;
        const client = createClient()
            .use(() => ({ rpc, rpcSubscriptions }))
            .use(rpcTransactionPlanExecutor());
        expect(client).toHaveProperty('transactionPlanExecutor');
        expect(client).not.toHaveProperty('sendTransaction');
        expect(client).not.toHaveProperty('sendTransactions');
    });

    it('requires an RPC instance on the client', () => {
        // @ts-expect-error Missing RPC and RPC Subscriptions on the client.
        expect(() => createClient().use(rpcTransactionPlanExecutor())).toThrow(
            /An RPC instance with subscriptions is required/,
        );
    });
});
