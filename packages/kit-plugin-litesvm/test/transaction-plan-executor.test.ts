import type { LiteSVM } from '@loris-sandbox/litesvm-kit';
import {
    Address,
    createEmptyClient,
    createTransactionMessage,
    generateKeyPairSigner,
    setTransactionMessageFeePayerSigner,
    singleInstructionPlan,
    singleTransactionPlan,
    SingleTransactionPlanResult,
    SOLANA_ERROR__INSTRUCTION_PLANS__FAILED_TO_EXECUTE_TRANSACTION_PLAN,
    SOLANA_ERROR__TRANSACTION__FAILED_WHEN_SIMULATING_TO_ESTIMATE_COMPUTE_LIMIT,
    SolanaError,
} from '@solana/kit';
import { describe, expect, it, vi } from 'vitest';

import { litesvmTransactionPlanExecutor, litesvmTransactionPlanner } from '../src';

const MOCK_BLOCKHASH = { blockhash: '11111111111111111111111111111111', lastValidBlockHeight: 0n };
const MOCK_INSTRUCTION = {
    programAddress: '11111111111111111111111111111111' as Address,
};

describe('litesvmTransactionPlanExecutor', () => {
    it('provides a transactionPlanExecutor on the client', () => {
        const svm = {} as LiteSVM;
        const client = createEmptyClient()
            .use(() => ({ svm }))
            .use(litesvmTransactionPlanExecutor());
        expect(client).toHaveProperty('transactionPlanExecutor');
    });

    it('uses the SVM instance to send transactions', async () => {
        const payer = await generateKeyPairSigner();
        const latestBlockhashLifetime = vi.fn().mockReturnValueOnce(MOCK_BLOCKHASH);
        const sendTransaction = vi.fn();
        const svm = { latestBlockhashLifetime, sendTransaction } as unknown as LiteSVM;
        const client = createEmptyClient()
            .use(() => ({ payer, svm }))
            .use(litesvmTransactionPlanner())
            .use(litesvmTransactionPlanExecutor());

        const instructionPlan = singleInstructionPlan(MOCK_INSTRUCTION);
        const transactionPlan = await client.transactionPlanner(instructionPlan);
        const transactionPlanResult = (await client.transactionPlanExecutor(
            transactionPlan,
        )) as SingleTransactionPlanResult;
        expect(transactionPlanResult.kind).toBe('single');
        expect(latestBlockhashLifetime).toHaveBeenCalledOnce();
        expect(sendTransaction).toHaveBeenCalledOnce();
    });

    it('unwraps simulation errors when executing transactions', async () => {
        const payer = await generateKeyPairSigner();
        const latestBlockhashLifetime = vi.fn().mockReturnValueOnce(MOCK_BLOCKHASH);
        const originalError = new Error('Original transaction error');
        const sendTransaction = vi.fn().mockImplementation(() => {
            throw new SolanaError(SOLANA_ERROR__TRANSACTION__FAILED_WHEN_SIMULATING_TO_ESTIMATE_COMPUTE_LIMIT, {
                cause: originalError,
                unitsConsumed: 42,
            });
        });
        const svm = { latestBlockhashLifetime, sendTransaction } as unknown as LiteSVM;
        const client = createEmptyClient()
            .use(() => ({ payer, svm }))
            .use(litesvmTransactionPlanExecutor());

        const transactionPlan = singleTransactionPlan(
            setTransactionMessageFeePayerSigner(payer, createTransactionMessage({ version: 0 })),
        );
        await expect(client.transactionPlanExecutor(transactionPlan)).rejects.toThrowError(
            new SolanaError(SOLANA_ERROR__INSTRUCTION_PLANS__FAILED_TO_EXECUTE_TRANSACTION_PLAN, {
                cause: originalError,
            }),
        );
    });

    it('does not unwrap non-simulation errors when executing transactions', async () => {
        const payer = await generateKeyPairSigner();
        const latestBlockhashLifetime = vi.fn().mockReturnValueOnce(MOCK_BLOCKHASH);
        const originalError = new Error('Original transaction error');
        const sendTransaction = vi.fn().mockImplementation(() => {
            throw originalError;
        });
        const svm = { latestBlockhashLifetime, sendTransaction } as unknown as LiteSVM;
        const client = createEmptyClient()
            .use(() => ({ payer, svm }))
            .use(litesvmTransactionPlanExecutor());

        const transactionPlan = singleTransactionPlan(
            setTransactionMessageFeePayerSigner(payer, createTransactionMessage({ version: 0 })),
        );
        await expect(client.transactionPlanExecutor(transactionPlan)).rejects.toThrowError(
            new SolanaError(SOLANA_ERROR__INSTRUCTION_PLANS__FAILED_TO_EXECUTE_TRANSACTION_PLAN, {
                cause: originalError,
            }),
        );
    });

    it('requires an svm instance on the client', () => {
        // @ts-expect-error Missing svm instance on the client.
        expect(() => createEmptyClient().use(litesvmTransactionPlanExecutor())).toThrow();
    });
});
