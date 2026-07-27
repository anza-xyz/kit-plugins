import {
    Address,
    createClient,
    generateKeyPairSigner,
    getTransactionMessageComputeUnitPrice,
    Lamports,
    MicroLamports,
    singleInstructionPlan,
    SingleTransactionPlan,
    TransactionMessage,
    TransactionSigner,
} from '@solana/kit';
import { assertType, describe, expect, it } from 'vitest';

import { litesvmTransactionPlanner, TransactionPlannerConfig } from '../src';

const MOCK_INSTRUCTION = {
    programAddress: '11111111111111111111111111111111' as Address,
};

describe('litesvmTransactionPlanner', () => {
    it('provides a transactionPlanner on the client', () => {
        const payer = {} as TransactionSigner;
        const client = createClient()
            .use(() => ({ payer }))
            .use(litesvmTransactionPlanner());
        expect(client).toHaveProperty('transactionPlanner');
    });

    it('uses the provided payer as fee payer when planning transactions', async () => {
        const payer = await generateKeyPairSigner();
        const client = createClient()
            .use(() => ({ payer }))
            .use(litesvmTransactionPlanner());

        const instructionPlan = singleInstructionPlan(MOCK_INSTRUCTION);
        const transactionPlan = (await client.transactionPlanner(instructionPlan)) as SingleTransactionPlan;
        expect(transactionPlan.kind).toBe('single');
        expect(transactionPlan.message.feePayer).toBe(payer);
    });

    it('creates version 0 transaction messages by default', async () => {
        const payer = await generateKeyPairSigner();
        const client = createClient()
            .use(() => ({ payer }))
            .use(litesvmTransactionPlanner());

        const instructionPlan = singleInstructionPlan(MOCK_INSTRUCTION);
        const transactionPlan = (await client.transactionPlanner(instructionPlan)) as SingleTransactionPlan;
        expect(transactionPlan.message.version).toBe(0);
    });

    it('creates legacy transaction messages when configured', async () => {
        const payer = await generateKeyPairSigner();
        const client = createClient()
            .use(() => ({ payer }))
            .use(litesvmTransactionPlanner({ version: 'legacy' }));

        const instructionPlan = singleInstructionPlan(MOCK_INSTRUCTION);
        const transactionPlan = (await client.transactionPlanner(instructionPlan)) as SingleTransactionPlan;
        expect(transactionPlan.message.version).toBe('legacy');
    });

    it('does not set a compute unit price by default', async () => {
        const payer = await generateKeyPairSigner();
        const client = createClient()
            .use(() => ({ payer }))
            .use(litesvmTransactionPlanner());

        const instructionPlan = singleInstructionPlan(MOCK_INSTRUCTION);
        const transactionPlan = (await client.transactionPlanner(instructionPlan)) as SingleTransactionPlan;
        const message = transactionPlan.message as TransactionMessage & { version: 'legacy' | 0 };
        expect(getTransactionMessageComputeUnitPrice(message)).toBeUndefined();
    });

    it('sets a compute unit price when configured', async () => {
        const payer = await generateKeyPairSigner();
        const client = createClient()
            .use(() => ({ payer }))
            .use(litesvmTransactionPlanner({ microLamportsPerComputeUnit: 100n as MicroLamports }));

        const instructionPlan = singleInstructionPlan(MOCK_INSTRUCTION);
        const transactionPlan = (await client.transactionPlanner(instructionPlan)) as SingleTransactionPlan;
        const message = transactionPlan.message as TransactionMessage & { version: 'legacy' | 0 };
        expect(getTransactionMessageComputeUnitPrice(message)).toBe(100n);
    });

    it('throws when configured with version 1 transactions', () => {
        const payer = {} as TransactionSigner;
        expect(() =>
            createClient()
                .use(() => ({ payer }))
                .use(litesvmTransactionPlanner({ version: 1 })),
        ).toThrow(/Version 1 transactions are not yet supported/);
    });

    it('requires a payer on the client', () => {
        // @ts-expect-error TypeScript fails but we don't throw an error at runtime.
        expect(() => createClient().use(litesvmTransactionPlanner())).not.toThrow();
    });

    it('discriminates the config shape on the transaction version', () => {
        // Legacy and version 0 accept `microLamportsPerComputeUnit` but not `priorityFeeLamports`.
        assertType<TransactionPlannerConfig>({ microLamportsPerComputeUnit: 1n as MicroLamports, version: 0 });
        // @ts-expect-error `priorityFeeLamports` is only valid for version 1.
        assertType<TransactionPlannerConfig>({ priorityFeeLamports: 1n as Lamports, version: 0 });

        // Version 1 accepts `priorityFeeLamports` but not `microLamportsPerComputeUnit`.
        assertType<TransactionPlannerConfig>({ priorityFeeLamports: 1n as Lamports, version: 1 });
        // @ts-expect-error `microLamportsPerComputeUnit` is only valid for legacy and version 0.
        assertType<TransactionPlannerConfig>({ microLamportsPerComputeUnit: 1n as MicroLamports, version: 1 });
    });
});
