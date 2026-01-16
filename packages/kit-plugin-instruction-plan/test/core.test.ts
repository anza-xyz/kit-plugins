import {
    createEmptyClient,
    Instruction,
    singleInstructionPlan,
    TransactionPlan,
    TransactionPlanResult,
} from '@solana/kit';
import { describe, expect, it, vi } from 'vitest';

import { sendInstructionPlans, transactionPlanExecutor, transactionPlanner } from '../src';

describe('transactionPlanner', () => {
    it('sets the provided transactionPlanner on the client', () => {
        const customTransactionPlanner = vi.fn();
        const client = createEmptyClient().use(transactionPlanner(customTransactionPlanner));
        expect(client).toHaveProperty('transactionPlanner');
        expect(client.transactionPlanner).toBe(customTransactionPlanner);
    });
});

describe('transactionPlanExecutor', () => {
    it('sets the provided transactionPlanExecutor on the client', () => {
        const customTransactionPlanExecutor = vi.fn();
        const client = createEmptyClient().use(transactionPlanExecutor(customTransactionPlanExecutor));
        expect(client).toHaveProperty('transactionPlanExecutor');
        expect(client.transactionPlanExecutor).toBe(customTransactionPlanExecutor);
    });
});

describe('sendInstructionPlans', () => {
    it('adds a send function on the client that plans and executes instructions', async () => {
        const instruction = {} as Instruction;
        const transactionPlan = {} as TransactionPlan;
        const transactionPlanResult = {} as TransactionPlanResult;

        const customTransactionPlanner = vi.fn().mockResolvedValue(transactionPlan);
        const customTransactionPlanExecutor = vi.fn().mockResolvedValue(transactionPlanResult);
        const client = createEmptyClient()
            .use(transactionPlanner(customTransactionPlanner))
            .use(transactionPlanExecutor(customTransactionPlanExecutor))
            .use(sendInstructionPlans());

        expect(client).toHaveProperty('send');
        const result = await client.send(instruction);
        expect(result).toBe(transactionPlanResult);
        expect(customTransactionPlanner).toHaveBeenCalledExactlyOnceWith(singleInstructionPlan(instruction), {
            abortSignal: undefined,
        });
        expect(customTransactionPlanExecutor).toHaveBeenCalledExactlyOnceWith(transactionPlan, {
            abortSignal: undefined,
        });
    });

    it('passes the abort signal through the planner and executor', async () => {
        const customTransactionPlanner = vi.fn().mockResolvedValue({});
        const customTransactionPlanExecutor = vi.fn().mockResolvedValue({});
        const client = createEmptyClient()
            .use(transactionPlanner(customTransactionPlanner))
            .use(transactionPlanExecutor(customTransactionPlanExecutor))
            .use(sendInstructionPlans());

        const abortSignal = new AbortController().signal;
        await client.send({} as Instruction, { abortSignal });
        expect(customTransactionPlanner).toHaveBeenCalledExactlyOnceWith(expect.any(Object), { abortSignal });
        expect(customTransactionPlanExecutor).toHaveBeenCalledExactlyOnceWith(expect.any(Object), { abortSignal });
    });

    it('does not call the planner if the abort signal is already triggered', async () => {
        const customTransactionPlanner = vi.fn();
        const customTransactionPlanExecutor = vi.fn();
        const client = createEmptyClient()
            .use(transactionPlanner(customTransactionPlanner))
            .use(transactionPlanExecutor(customTransactionPlanExecutor))
            .use(sendInstructionPlans());

        const abortController = new AbortController();
        abortController.abort();
        await client.send({} as Instruction, { abortSignal: abortController.signal }).catch(() => {});
        expect(customTransactionPlanner).not.toHaveBeenCalledOnce();
        expect(customTransactionPlanExecutor).not.toHaveBeenCalledOnce();
    });

    it('can override the planner and executor set on the client', async () => {
        const transactionPlannerOnTheClient = vi.fn().mockResolvedValue({});
        const transactionPlanExecutorOnTheClient = vi.fn().mockResolvedValue({});
        const client = createEmptyClient()
            .use(transactionPlanner(transactionPlannerOnTheClient))
            .use(transactionPlanExecutor(transactionPlanExecutorOnTheClient))
            .use(sendInstructionPlans());

        const overridenTransactionPlanner = vi.fn().mockResolvedValue({});
        const overridenTransactionPlanExecutor = vi.fn().mockResolvedValue({});

        await client.send({} as Instruction, {
            transactionPlanExecutor: overridenTransactionPlanExecutor,
            transactionPlanner: overridenTransactionPlanner,
        });
        expect(overridenTransactionPlanner).toHaveBeenCalledOnce();
        expect(overridenTransactionPlanExecutor).toHaveBeenCalledOnce();
        expect(transactionPlannerOnTheClient).not.toHaveBeenCalledOnce();
        expect(transactionPlanExecutorOnTheClient).not.toHaveBeenCalledOnce();
    });
});
