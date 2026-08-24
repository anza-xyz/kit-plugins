import {
    Address,
    createClient,
    generateKeyPairSigner,
    getTransactionMessageComputeUnitLimit,
    getTransactionMessageComputeUnitPrice,
    getTransactionMessageLoadedAccountsDataSizeLimit,
    getTransactionMessagePriorityFeeLamports,
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

    it('reads client.payer at plan time rather than at install time', async () => {
        const first = await generateKeyPairSigner();
        const second = await generateKeyPairSigner();
        let current = first;
        const client = createClient()
            .use(() => ({
                get payer() {
                    return current;
                },
            }))
            .use(litesvmTransactionPlanner());

        current = second;
        const instructionPlan = singleInstructionPlan(MOCK_INSTRUCTION);
        const transactionMessage = await client.planTransaction(instructionPlan);
        expect(transactionMessage.feePayer.address).toBe(second.address);
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

    it('creates version 1 transaction messages when configured', async () => {
        const payer = await generateKeyPairSigner();
        const client = createClient()
            .use(() => ({ payer }))
            .use(litesvmTransactionPlanner({ version: 1 }));

        const instructionPlan = singleInstructionPlan(MOCK_INSTRUCTION);
        const transactionPlan = (await client.transactionPlanner(instructionPlan)) as SingleTransactionPlan;
        expect(transactionPlan.message.version).toBe(1);
        expect(transactionPlan.message.feePayer).toBe(payer);
    });

    it('does not set a priority fee on version 1 transaction messages by default', async () => {
        const payer = await generateKeyPairSigner();
        const client = createClient()
            .use(() => ({ payer }))
            .use(litesvmTransactionPlanner({ version: 1 }));

        const instructionPlan = singleInstructionPlan(MOCK_INSTRUCTION);
        const transactionPlan = (await client.transactionPlanner(instructionPlan)) as SingleTransactionPlan;
        const message = transactionPlan.message as TransactionMessage & { version: 1 };
        expect(getTransactionMessagePriorityFeeLamports(message)).toBeUndefined();
    });

    it('sets a priority fee on version 1 transaction messages when configured', async () => {
        const payer = await generateKeyPairSigner();
        const client = createClient()
            .use(() => ({ payer }))
            .use(litesvmTransactionPlanner({ priorityFeeLamports: 100n as Lamports, version: 1 }));

        const instructionPlan = singleInstructionPlan(MOCK_INSTRUCTION);
        const transactionPlan = (await client.transactionPlanner(instructionPlan)) as SingleTransactionPlan;
        const message = transactionPlan.message as TransactionMessage & { version: 1 };
        expect(getTransactionMessagePriorityFeeLamports(message)).toBe(100n);
    });

    it('sets maximum resource limits on version 1 transaction messages by default', async () => {
        const payer = await generateKeyPairSigner();
        const client = createClient()
            .use(() => ({ payer }))
            .use(litesvmTransactionPlanner({ version: 1 }));

        // Unset resource limits in a version 1 transaction config are treated
        // as zero by the runtime, so the planner defaults to maximum limits.
        const instructionPlan = singleInstructionPlan(MOCK_INSTRUCTION);
        const transactionPlan = (await client.transactionPlanner(instructionPlan)) as SingleTransactionPlan;
        const message = transactionPlan.message as TransactionMessage & { version: 1 };
        expect(getTransactionMessageComputeUnitLimit(message)).toBe(1_400_000);
        expect(getTransactionMessageLoadedAccountsDataSizeLimit(message)).toBe(64 * 1024 * 1024);
    });

    it('sets custom resource limits on version 1 transaction messages when configured', async () => {
        const payer = await generateKeyPairSigner();
        const client = createClient()
            .use(() => ({ payer }))
            .use(
                litesvmTransactionPlanner({
                    computeUnitLimit: 200_000,
                    loadedAccountsDataSizeLimit: 1024 * 1024,
                    version: 1,
                }),
            );

        const instructionPlan = singleInstructionPlan(MOCK_INSTRUCTION);
        const transactionPlan = (await client.transactionPlanner(instructionPlan)) as SingleTransactionPlan;
        const message = transactionPlan.message as TransactionMessage & { version: 1 };
        expect(getTransactionMessageComputeUnitLimit(message)).toBe(200_000);
        expect(getTransactionMessageLoadedAccountsDataSizeLimit(message)).toBe(1024 * 1024);
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

        // Version 1 accepts resource limits but legacy and version 0 do not.
        assertType<TransactionPlannerConfig>({ computeUnitLimit: 1, loadedAccountsDataSizeLimit: 1, version: 1 });
        // @ts-expect-error `computeUnitLimit` is only valid for version 1.
        assertType<TransactionPlannerConfig>({ computeUnitLimit: 1, version: 0 });
        // @ts-expect-error `loadedAccountsDataSizeLimit` is only valid for version 1.
        assertType<TransactionPlannerConfig>({ loadedAccountsDataSizeLimit: 1, version: 0 });
    });
});
