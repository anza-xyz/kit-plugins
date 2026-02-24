import {
    Address,
    createEmptyClient,
    generateKeyPairSigner,
    singleInstructionPlan,
    SingleTransactionPlan,
    TransactionSigner,
} from '@solana/kit';
import { describe, expect, it } from 'vitest';

import { litesvmTransactionPlanner } from '../src';

const MOCK_INSTRUCTION = {
    programAddress: '11111111111111111111111111111111' as Address,
};

describe('litesvmTransactionPlanner', () => {
    it('provides a transactionPlanner on the client', () => {
        const payer = {} as TransactionSigner;
        const client = createEmptyClient()
            .use(() => ({ payer }))
            .use(litesvmTransactionPlanner());
        expect(client).toHaveProperty('transactionPlanner');
    });

    it('uses the provided payer as fee payer when planning transactions', async () => {
        const payer = await generateKeyPairSigner();
        const client = createEmptyClient()
            .use(() => ({ payer }))
            .use(litesvmTransactionPlanner());

        const instructionPlan = singleInstructionPlan(MOCK_INSTRUCTION);
        const transactionPlan = (await client.transactionPlanner(instructionPlan)) as SingleTransactionPlan;
        expect(transactionPlan.kind).toBe('single');
        expect(transactionPlan.message.feePayer).toBe(payer);
    });

    it('requires a payer on the client by default', () => {
        expect(() => createEmptyClient().use(litesvmTransactionPlanner())).toThrow();
    });

    it('also accepts a payer directly', () => {
        const payer = {} as TransactionSigner;
        expect(() => createEmptyClient().use(litesvmTransactionPlanner({ payer }))).not.toThrow();
    });

    it('uses the provided payer over the one set on the client', async () => {
        const [clientPayer, explicitPayer] = await Promise.all([generateKeyPairSigner(), generateKeyPairSigner()]);
        const client = createEmptyClient()
            .use(() => ({ payer: clientPayer }))
            .use(litesvmTransactionPlanner({ payer: explicitPayer }));

        const instructionPlan = singleInstructionPlan(MOCK_INSTRUCTION);
        const transactionPlan = (await client.transactionPlanner(instructionPlan)) as SingleTransactionPlan;
        expect(transactionPlan.kind).toBe('single');
        expect(transactionPlan.message.feePayer).toBe(explicitPayer);
    });
});
