import {
    Address,
    createEmptyClient,
    createTransactionMessage,
    generateKeyPairSigner,
    setTransactionMessageFeePayerSigner,
    singleInstructionPlan,
    SingleTransactionPlan,
    singleTransactionPlan,
    SingleTransactionPlanResult,
    SOLANA_ERROR__INSTRUCTION_PLANS__FAILED_TO_EXECUTE_TRANSACTION_PLAN,
    SOLANA_ERROR__TRANSACTION__FAILED_WHEN_SIMULATING_TO_ESTIMATE_COMPUTE_LIMIT,
    SolanaError,
    TransactionSigner,
} from '@solana/kit';
import type { LiteSVM } from '@solana/kit-plugin-litesvm';
import { describe, expect, it, vi } from 'vitest';

import { defaultTransactionPlannerAndExecutorFromLitesvm } from '../src';

const MOCK_BLOCKHASH = { blockhash: '11111111111111111111111111111111', lastValidBlockHeight: 0n };
const MOCK_INSTRUCTION = {
    programAddress: '11111111111111111111111111111111' as Address,
};

describe('defaultTransactionPlannerAndExecutorFromLitesvm', () => {
    it('provides a default transactionPlanner and transactionPlanExecutor on the client', () => {
        const payer = {} as TransactionSigner;
        const svm = {} as LiteSVM;
        const client = createEmptyClient()
            .use(() => ({ payer, svm }))
            .use(defaultTransactionPlannerAndExecutorFromLitesvm());
        expect(client).toHaveProperty('transactionPlanner');
        expect(client).toHaveProperty('transactionPlanExecutor');
    });

    it('uses the provided payer as fee payer when planning transactions', async () => {
        const payer = await generateKeyPairSigner();
        const svm = {} as LiteSVM;
        const client = createEmptyClient()
            .use(() => ({ payer, svm }))
            .use(defaultTransactionPlannerAndExecutorFromLitesvm());

        const instructionPlan = singleInstructionPlan(MOCK_INSTRUCTION);
        const transactionPlan = (await client.transactionPlanner(instructionPlan)) as SingleTransactionPlan;
        expect(transactionPlan.kind).toBe('single');
        expect(transactionPlan.message.feePayer).toBe(payer);
    });

    it('uses the SVM instance to send transactions', async () => {
        const payer = await generateKeyPairSigner();
        const latestBlockhashLifetime = vi.fn().mockReturnValueOnce(MOCK_BLOCKHASH);
        const sendTransaction = vi.fn();
        const svm = { latestBlockhashLifetime, sendTransaction } as unknown as LiteSVM;
        const client = createEmptyClient()
            .use(() => ({ payer, svm }))
            .use(defaultTransactionPlannerAndExecutorFromLitesvm());

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
            .use(defaultTransactionPlannerAndExecutorFromLitesvm());

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
            .use(defaultTransactionPlannerAndExecutorFromLitesvm());

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
        expect(() => createEmptyClient().use(defaultTransactionPlannerAndExecutorFromLitesvm())).toThrow();
    });

    it('requires a payer on the client by default', () => {
        const svm = {} as LiteSVM;
        expect(() =>
            createEmptyClient()
                .use(() => ({ svm }))
                .use(defaultTransactionPlannerAndExecutorFromLitesvm()),
        ).toThrow();
    });

    it('also accepts a payer directly', () => {
        const payer = {} as TransactionSigner;
        const svm = {} as LiteSVM;
        expect(() =>
            createEmptyClient()
                .use(() => ({ svm }))
                .use(defaultTransactionPlannerAndExecutorFromLitesvm({ payer })),
        ).not.toThrow();
    });

    it('uses the provided payer over the one set on the client', async () => {
        const [clientPayer, explicitPayer] = await Promise.all([generateKeyPairSigner(), generateKeyPairSigner()]);
        const svm = {} as LiteSVM;
        const client = createEmptyClient()
            .use(() => ({ payer: clientPayer, svm }))
            .use(defaultTransactionPlannerAndExecutorFromLitesvm({ payer: explicitPayer }));

        const instructionPlan = singleInstructionPlan(MOCK_INSTRUCTION);
        const transactionPlan = (await client.transactionPlanner(instructionPlan)) as SingleTransactionPlan;
        expect(transactionPlan.kind).toBe('single');
        expect(transactionPlan.message.feePayer).toBe(explicitPayer);
    });
});
