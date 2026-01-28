import {
    canceledSingleTransactionPlanResult,
    createEmptyClient,
    Instruction,
    sequentialInstructionPlan,
    sequentialTransactionPlan,
    sequentialTransactionPlanResult,
    Signature,
    singleInstructionPlan,
    singleTransactionPlan,
    SOLANA_ERROR__INSTRUCTION_PLANS__UNEXPECTED_TRANSACTION_PLAN,
    SOLANA_ERROR__INSTRUCTION_PLANS__UNEXPECTED_TRANSACTION_PLAN_RESULT,
    SolanaError,
    SuccessfulSingleTransactionPlanResult,
    successfulSingleTransactionPlanResultFromSignature,
    TransactionMessage,
    TransactionMessageWithFeePayer,
    TransactionPlan,
    TransactionPlanResult,
} from '@solana/kit';
import { describe, expect, it, vi } from 'vitest';

import { sendTransactions, transactionPlanExecutor, transactionPlanner } from '../src';

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

describe('sendTransactions', () => {
    describe('client.sendTransaction', () => {
        it('adds a sendTransaction function on the client that plans and executes instructions', async () => {
            const instruction = {} as Instruction;
            const transactionPlan = singleTransactionPlan({} as TransactionMessage & TransactionMessageWithFeePayer);
            const transactionPlanResult = successfulSingleTransactionPlanResultFromSignature(
                {} as TransactionMessage & TransactionMessageWithFeePayer,
                'signature' as Signature,
            );

            const customTransactionPlanner = vi.fn().mockResolvedValue(transactionPlan);
            const customTransactionPlanExecutor = vi.fn().mockResolvedValue(transactionPlanResult);
            const client = createEmptyClient()
                .use(transactionPlanner(customTransactionPlanner))
                .use(transactionPlanExecutor(customTransactionPlanExecutor))
                .use(sendTransactions());

            expect(client).toHaveProperty('sendTransaction');
            const result = await client.sendTransaction(instruction);
            result satisfies SuccessfulSingleTransactionPlanResult;

            expect(result).toBe(transactionPlanResult);
            expect(customTransactionPlanner).toHaveBeenCalledExactlyOnceWith(singleInstructionPlan(instruction), {
                abortSignal: undefined,
            });
            expect(customTransactionPlanExecutor).toHaveBeenCalledExactlyOnceWith(transactionPlan, {
                abortSignal: undefined,
            });
        });

        it('fails if the transaction plan is not a single transaction plan', async () => {
            const instructionPlan = sequentialInstructionPlan([{} as Instruction]);
            const transactionPlan = sequentialTransactionPlan([
                {} as TransactionMessage & TransactionMessageWithFeePayer,
            ]);
            const customTransactionPlanner = vi.fn().mockResolvedValue(transactionPlan);
            const customTransactionPlanExecutor = vi.fn();
            const client = createEmptyClient()
                .use(transactionPlanner(customTransactionPlanner))
                .use(transactionPlanExecutor(customTransactionPlanExecutor))
                .use(sendTransactions());

            const promise = client.sendTransaction(instructionPlan);
            await expect(promise).rejects.toThrowError(
                new SolanaError(SOLANA_ERROR__INSTRUCTION_PLANS__UNEXPECTED_TRANSACTION_PLAN, {
                    actualKind: 'sequential',
                    expectedKind: 'single',
                    transactionPlan,
                }),
            );
        });

        it('fails if the transaction plan result is not a single transaction plan result', async () => {
            const instructionPlan = sequentialInstructionPlan([{} as Instruction]);
            const transactionPlan = singleTransactionPlan({} as TransactionMessage & TransactionMessageWithFeePayer);
            const transactionPlanResult = sequentialTransactionPlanResult([
                successfulSingleTransactionPlanResultFromSignature(
                    {} as TransactionMessage & TransactionMessageWithFeePayer,
                    'signature' as Signature,
                ),
            ]);
            const customTransactionPlanner = vi.fn().mockResolvedValue(transactionPlan);
            const customTransactionPlanExecutor = vi.fn().mockResolvedValue(transactionPlanResult);
            const client = createEmptyClient()
                .use(transactionPlanner(customTransactionPlanner))
                .use(transactionPlanExecutor(customTransactionPlanExecutor))
                .use(sendTransactions());

            const promise = client.sendTransaction(instructionPlan);
            await expect(promise).rejects.toThrowError(
                new SolanaError(SOLANA_ERROR__INSTRUCTION_PLANS__UNEXPECTED_TRANSACTION_PLAN_RESULT, {
                    actualKind: 'sequential',
                    expectedKind: 'successful single',
                    transactionPlanResult,
                }),
            );
        });

        it('fails if the transaction plan result is not a successful single transaction plan result', async () => {
            const instructionPlan = sequentialInstructionPlan([{} as Instruction]);
            const transactionPlan = singleTransactionPlan({} as TransactionMessage & TransactionMessageWithFeePayer);
            const transactionPlanResult = canceledSingleTransactionPlanResult(
                {} as TransactionMessage & TransactionMessageWithFeePayer,
            );
            const customTransactionPlanner = vi.fn().mockResolvedValue(transactionPlan);
            const customTransactionPlanExecutor = vi.fn().mockResolvedValue(transactionPlanResult);
            const client = createEmptyClient()
                .use(transactionPlanner(customTransactionPlanner))
                .use(transactionPlanExecutor(customTransactionPlanExecutor))
                .use(sendTransactions());

            const promise = client.sendTransaction(instructionPlan);
            await expect(promise).rejects.toThrowError(
                new SolanaError(SOLANA_ERROR__INSTRUCTION_PLANS__UNEXPECTED_TRANSACTION_PLAN_RESULT, {
                    actualKind: 'canceled single',
                    expectedKind: 'successful single',
                    transactionPlanResult,
                }),
            );
        });

        it('passes the abort signal through the planner and executor', async () => {
            const transactionPlan = singleTransactionPlan({} as TransactionMessage & TransactionMessageWithFeePayer);
            const transactionPlanResult = successfulSingleTransactionPlanResultFromSignature(
                {} as TransactionMessage & TransactionMessageWithFeePayer,
                'signature' as Signature,
            );
            const customTransactionPlanner = vi.fn().mockResolvedValue(transactionPlan);
            const customTransactionPlanExecutor = vi.fn().mockResolvedValue(transactionPlanResult);
            const client = createEmptyClient()
                .use(transactionPlanner(customTransactionPlanner))
                .use(transactionPlanExecutor(customTransactionPlanExecutor))
                .use(sendTransactions());

            const abortSignal = new AbortController().signal;
            await client.sendTransaction({} as Instruction, { abortSignal });
            expect(customTransactionPlanner).toHaveBeenCalledExactlyOnceWith(expect.any(Object), { abortSignal });
            expect(customTransactionPlanExecutor).toHaveBeenCalledExactlyOnceWith(expect.any(Object), { abortSignal });
        });

        it('does not call the planner if the abort signal is already triggered', async () => {
            const customTransactionPlanner = vi.fn();
            const customTransactionPlanExecutor = vi.fn();
            const client = createEmptyClient()
                .use(transactionPlanner(customTransactionPlanner))
                .use(transactionPlanExecutor(customTransactionPlanExecutor))
                .use(sendTransactions());

            const abortController = new AbortController();
            abortController.abort();
            await client.sendTransaction({} as Instruction, { abortSignal: abortController.signal }).catch(() => {});
            expect(customTransactionPlanner).not.toHaveBeenCalledOnce();
            expect(customTransactionPlanExecutor).not.toHaveBeenCalledOnce();
        });

        it('can override the planner and executor set on the client', async () => {
            const transactionPlan = singleTransactionPlan({} as TransactionMessage & TransactionMessageWithFeePayer);
            const transactionPlanResult = successfulSingleTransactionPlanResultFromSignature(
                {} as TransactionMessage & TransactionMessageWithFeePayer,
                'signature' as Signature,
            );
            const transactionPlannerOnTheClient = vi.fn().mockResolvedValue(transactionPlan);
            const transactionPlanExecutorOnTheClient = vi.fn().mockResolvedValue(transactionPlanResult);
            const client = createEmptyClient()
                .use(transactionPlanner(transactionPlannerOnTheClient))
                .use(transactionPlanExecutor(transactionPlanExecutorOnTheClient))
                .use(sendTransactions());

            const overridenTransactionPlanner = vi.fn().mockResolvedValue(transactionPlan);
            const overridenTransactionPlanExecutor = vi.fn().mockResolvedValue(transactionPlanResult);

            await client.sendTransaction(singleInstructionPlan({} as Instruction), {
                transactionPlanExecutor: overridenTransactionPlanExecutor,
                transactionPlanner: overridenTransactionPlanner,
            });
            expect(overridenTransactionPlanner).toHaveBeenCalledOnce();
            expect(overridenTransactionPlanExecutor).toHaveBeenCalledOnce();
            expect(transactionPlannerOnTheClient).not.toHaveBeenCalledOnce();
            expect(transactionPlanExecutorOnTheClient).not.toHaveBeenCalledOnce();
        });
    });
    describe('client.sendTransactions', () => {
        it('adds a sendTransactions function on the client that plans and executes instructions', async () => {
            const instruction = {} as Instruction;
            const transactionPlan = {} as TransactionPlan;
            const transactionPlanResult = {} as TransactionPlanResult;

            const customTransactionPlanner = vi.fn().mockResolvedValue(transactionPlan);
            const customTransactionPlanExecutor = vi.fn().mockResolvedValue(transactionPlanResult);
            const client = createEmptyClient()
                .use(transactionPlanner(customTransactionPlanner))
                .use(transactionPlanExecutor(customTransactionPlanExecutor))
                .use(sendTransactions());

            expect(client).toHaveProperty('sendTransactions');
            const result = await client.sendTransactions(instruction);
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
                .use(sendTransactions());

            const abortSignal = new AbortController().signal;
            await client.sendTransactions({} as Instruction, { abortSignal });
            expect(customTransactionPlanner).toHaveBeenCalledExactlyOnceWith(expect.any(Object), { abortSignal });
            expect(customTransactionPlanExecutor).toHaveBeenCalledExactlyOnceWith(expect.any(Object), { abortSignal });
        });

        it('does not call the planner if the abort signal is already triggered', async () => {
            const customTransactionPlanner = vi.fn();
            const customTransactionPlanExecutor = vi.fn();
            const client = createEmptyClient()
                .use(transactionPlanner(customTransactionPlanner))
                .use(transactionPlanExecutor(customTransactionPlanExecutor))
                .use(sendTransactions());

            const abortController = new AbortController();
            abortController.abort();
            await client.sendTransactions({} as Instruction, { abortSignal: abortController.signal }).catch(() => {});
            expect(customTransactionPlanner).not.toHaveBeenCalledOnce();
            expect(customTransactionPlanExecutor).not.toHaveBeenCalledOnce();
        });

        it('can override the planner and executor set on the client', async () => {
            const transactionPlannerOnTheClient = vi.fn().mockResolvedValue({});
            const transactionPlanExecutorOnTheClient = vi.fn().mockResolvedValue({});
            const client = createEmptyClient()
                .use(transactionPlanner(transactionPlannerOnTheClient))
                .use(transactionPlanExecutor(transactionPlanExecutorOnTheClient))
                .use(sendTransactions());

            const overridenTransactionPlanner = vi.fn().mockResolvedValue({});
            const overridenTransactionPlanExecutor = vi.fn().mockResolvedValue({});

            await client.sendTransactions({} as Instruction, {
                transactionPlanExecutor: overridenTransactionPlanExecutor,
                transactionPlanner: overridenTransactionPlanner,
            });
            expect(overridenTransactionPlanner).toHaveBeenCalledOnce();
            expect(overridenTransactionPlanExecutor).toHaveBeenCalledOnce();
            expect(transactionPlannerOnTheClient).not.toHaveBeenCalledOnce();
            expect(transactionPlanExecutorOnTheClient).not.toHaveBeenCalledOnce();
        });
    });
});
