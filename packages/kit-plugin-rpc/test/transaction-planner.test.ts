import {
    Address,
    createClient,
    generateKeyPairSigner,
    singleInstructionPlan,
    SingleTransactionPlan,
    TransactionSigner,
} from '@solana/kit';
import { describe, expect, it } from 'vitest';

import { rpcTransactionPlanner } from '../src';

const MOCK_INSTRUCTION = {
    programAddress: '11111111111111111111111111111111' as Address,
};

describe('rpcTransactionPlanner', () => {
    it('provides a transactionPlanner on the client', () => {
        const payer = {} as TransactionSigner;
        const client = createClient()
            .use(() => ({ payer }))
            .use(rpcTransactionPlanner());
        expect(client).toHaveProperty('transactionPlanner');
    });

    it('uses the provided payer as fee payer when planning transactions', async () => {
        const payer = await generateKeyPairSigner();
        const client = createClient()
            .use(() => ({ payer }))
            .use(rpcTransactionPlanner());

        const instructionPlan = singleInstructionPlan(MOCK_INSTRUCTION);
        const transactionPlan = (await client.transactionPlanner(instructionPlan)) as SingleTransactionPlan;
        expect(transactionPlan.kind).toBe('single');
        expect(transactionPlan.message.feePayer).toBe(payer);
    });

    it('requires a payer on the client', () => {
        // @ts-expect-error TypeScript fails but we don't throw an error at runtime.
        expect(() => createClient().use(rpcTransactionPlanner())).not.toThrow();
    });
});
