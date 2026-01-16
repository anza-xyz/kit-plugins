import {
    Address,
    createEmptyClient,
    generateKeyPairSigner,
    singleInstructionPlan,
    SingleTransactionPlan,
    SingleTransactionPlanResult,
    TransactionSigner,
} from '@solana/kit';
import type { LiteSVM } from '@solana/kit-plugin-litesvm';
import { describe, expect, it, vi } from 'vitest';

import { defaultTransactionPlannerAndExecutorFromLitesvm } from '../src';

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
        const mockBlockhash = { blockhash: '11111111111111111111111111111111', lastValidBlockHeight: 0n };
        const latestBlockhashLifetime = vi.fn().mockReturnValueOnce(mockBlockhash);
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
