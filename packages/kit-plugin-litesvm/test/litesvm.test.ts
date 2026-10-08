import {
    Address,
    createClient,
    flattenTransactionPlan,
    generateKeyPairSigner,
    TransactionPlanExecutor,
    TransactionSigner,
} from '@solana/kit';
import { describe, expect, expectTypeOf, it } from 'vitest';

import type { LiteSvmSendContext } from '../src/index';
import { litesvm as nodeLitesvm } from '../src/index';
import { litesvm as browserLitesvm } from '../src/index.browser';
const litesvm = __NODEJS__ ? nodeLitesvm : browserLitesvm;

describe('litesvm', () => {
    if (!__NODEJS__) {
        it('throws in browser builds', () => {
            expect(litesvm).toThrow('The `litesvm` plugin is unavailable in browser and react-native');
        });
        return;
    }

    const payer = {} as TransactionSigner;

    it('sets up a full LiteSVM client with all plugins', () => {
        const client = createClient()
            .use(() => ({ payer }))
            .use(litesvm());
        expect(client).toHaveProperty('svm');
        expect(client).toHaveProperty('rpc');
        expect(client).toHaveProperty('airdrop');
        expect(client).toHaveProperty('getMinimumBalance');
        expect(client).toHaveProperty('transactionPlanner');
        expect(client).toHaveProperty('transactionPlanExecutor');
        expect(client.planTransaction).toBeTypeOf('function');
        expect(client.planTransactions).toBeTypeOf('function');
        expect(client.signTransaction).toBeTypeOf('function');
        expect(client.signTransactions).toBeTypeOf('function');
        expect(client.sendTransaction).toBeTypeOf('function');
        expect(client.sendTransactions).toBeTypeOf('function');
    });

    it('preserves the LiteSVM result context on the executor', () => {
        const client = createClient()
            .use(() => ({ payer }))
            .use(nodeLitesvm());
        expectTypeOf(client.transactionPlanExecutor).toEqualTypeOf<TransactionPlanExecutor<LiteSvmSendContext>>();
    });

    it('forwards the transaction config to the transaction planner', async () => {
        const feePayer = await generateKeyPairSigner();
        const client = createClient()
            .use(() => ({ payer: feePayer }))
            .use(litesvm({ transactionConfig: { maxInstructionsPerTransaction: 2 } }));

        const instruction = { programAddress: '11111111111111111111111111111111' as Address };
        const transactionPlan = await client.planTransactions([instruction, instruction, instruction]);
        const instructionCounts = flattenTransactionPlan(transactionPlan).map(p => p.message.instructions.length);
        expect(instructionCounts).toStrictEqual([2, 1]);
    });
});
