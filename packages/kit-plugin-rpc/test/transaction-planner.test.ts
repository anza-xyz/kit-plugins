import {
    Address,
    createClient,
    generateKeyPairSigner,
    getTransactionMessageComputeUnitPrice,
    MicroLamports,
    singleInstructionPlan,
    SingleTransactionPlan,
    TransactionMessage,
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

    it('creates version 0 transaction messages by default', async () => {
        const payer = await generateKeyPairSigner();
        const client = createClient()
            .use(() => ({ payer }))
            .use(rpcTransactionPlanner());

        const instructionPlan = singleInstructionPlan(MOCK_INSTRUCTION);
        const transactionPlan = (await client.transactionPlanner(instructionPlan)) as SingleTransactionPlan;
        expect(transactionPlan.message.version).toBe(0);
    });

    it('creates legacy transaction messages when configured', async () => {
        const payer = await generateKeyPairSigner();
        const client = createClient()
            .use(() => ({ payer }))
            .use(rpcTransactionPlanner({ version: 'legacy' }));

        const instructionPlan = singleInstructionPlan(MOCK_INSTRUCTION);
        const transactionPlan = (await client.transactionPlanner(instructionPlan)) as SingleTransactionPlan;
        expect(transactionPlan.message.version).toBe('legacy');
    });

    it('does not set a compute unit price by default', async () => {
        const payer = await generateKeyPairSigner();
        const client = createClient()
            .use(() => ({ payer }))
            .use(rpcTransactionPlanner());

        const instructionPlan = singleInstructionPlan(MOCK_INSTRUCTION);
        const transactionPlan = (await client.transactionPlanner(instructionPlan)) as SingleTransactionPlan;
        const message = transactionPlan.message as TransactionMessage & { version: 'legacy' | 0 };
        expect(getTransactionMessageComputeUnitPrice(message)).toBeUndefined();
    });

    it('sets a compute unit price when configured', async () => {
        const payer = await generateKeyPairSigner();
        const client = createClient()
            .use(() => ({ payer }))
            .use(rpcTransactionPlanner({ microLamportsPerComputeUnit: 100n as MicroLamports }));

        const instructionPlan = singleInstructionPlan(MOCK_INSTRUCTION);
        const transactionPlan = (await client.transactionPlanner(instructionPlan)) as SingleTransactionPlan;
        const message = transactionPlan.message as TransactionMessage & { version: 'legacy' | 0 };
        expect(getTransactionMessageComputeUnitPrice(message)).toBe(100n);
    });

    it('requires a payer on the client', () => {
        // @ts-expect-error TypeScript fails but we don't throw an error at runtime.
        expect(() => createClient().use(rpcTransactionPlanner())).not.toThrow();
    });
});
