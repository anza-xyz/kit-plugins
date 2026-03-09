import {
    Address,
    canceledSingleTransactionPlanResult,
    createEmptyClient,
    createFailedToExecuteTransactionPlanError,
    createTransactionMessage,
    failedSingleTransactionPlanResult,
    Instruction,
    isSolanaError,
    sequentialInstructionPlan,
    sequentialTransactionPlan,
    sequentialTransactionPlanResult,
    setTransactionMessageFeePayer,
    Signature,
    singleInstructionPlan,
    singleTransactionPlan,
    SOLANA_ERROR__FAILED_TO_SEND_TRANSACTION,
    SOLANA_ERROR__FAILED_TO_SEND_TRANSACTIONS,
    SOLANA_ERROR__INSTRUCTION_PLANS__UNEXPECTED_TRANSACTION_PLAN,
    SOLANA_ERROR__INSTRUCTION_PLANS__UNEXPECTED_TRANSACTION_PLAN_RESULT,
    SOLANA_ERROR__JSON_RPC__SERVER_ERROR_SEND_TRANSACTION_PREFLIGHT_FAILURE,
    SOLANA_ERROR__TRANSACTION_ERROR__INSUFFICIENT_FUNDS_FOR_FEE,
    SolanaError,
    SuccessfulSingleTransactionPlanResult,
    successfulSingleTransactionPlanResult,
    TransactionMessage,
    TransactionMessageWithFeePayer,
    TransactionPlan,
    TransactionPlanResult,
} from '@solana/kit';
import { assert, describe, expect, it, vi } from 'vitest';

import { planAndSendTransactions, transactionPlanExecutor, transactionPlanner } from '../src';

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

describe('planAndSendTransactions', () => {
    describe('client.planTransaction', () => {
        it('adds a planTransaction function on the client that plans instructions and returns a transaction message', async () => {
            const instruction = {} as Instruction;
            const transactionPlan = singleTransactionPlan({} as TransactionMessage & TransactionMessageWithFeePayer);

            const customTransactionPlanner = vi.fn().mockResolvedValue(transactionPlan);
            const customTransactionPlanExecutor = vi.fn();
            const client = createEmptyClient()
                .use(transactionPlanner(customTransactionPlanner))
                .use(transactionPlanExecutor(customTransactionPlanExecutor))
                .use(planAndSendTransactions());

            expect(client).toHaveProperty('planTransaction');
            const result = await client.planTransaction(instruction);
            result satisfies TransactionMessage & TransactionMessageWithFeePayer;

            expect(result).toBe(transactionPlan.message);
            expect(customTransactionPlanner).toHaveBeenCalledExactlyOnceWith(singleInstructionPlan(instruction), {
                abortSignal: undefined,
            });
            expect(customTransactionPlanExecutor).not.toHaveBeenCalled();
        });

        it('fails if the transaction plan is not a single transaction plan', async () => {
            const instructionPlan = sequentialInstructionPlan([{} as Instruction]);
            const transactionPlan = sequentialTransactionPlan([
                {} as TransactionMessage & TransactionMessageWithFeePayer,
                {} as TransactionMessage & TransactionMessageWithFeePayer,
            ]);
            const customTransactionPlanner = vi.fn().mockResolvedValue(transactionPlan);
            const customTransactionPlanExecutor = vi.fn();
            const client = createEmptyClient()
                .use(transactionPlanner(customTransactionPlanner))
                .use(transactionPlanExecutor(customTransactionPlanExecutor))
                .use(planAndSendTransactions());

            const promise = client.planTransaction(instructionPlan);
            await expect(promise).rejects.toThrowError(
                new SolanaError(SOLANA_ERROR__INSTRUCTION_PLANS__UNEXPECTED_TRANSACTION_PLAN, {
                    actualKind: 'sequential',
                    expectedKind: 'single',
                    transactionPlan,
                }),
            );
        });

        it('passes the abort signal through the planner', async () => {
            const transactionPlan = singleTransactionPlan({} as TransactionMessage & TransactionMessageWithFeePayer);
            const customTransactionPlanner = vi.fn().mockResolvedValue(transactionPlan);
            const customTransactionPlanExecutor = vi.fn();
            const client = createEmptyClient()
                .use(transactionPlanner(customTransactionPlanner))
                .use(transactionPlanExecutor(customTransactionPlanExecutor))
                .use(planAndSendTransactions());

            const abortSignal = new AbortController().signal;
            await client.planTransaction({} as Instruction, { abortSignal });
            expect(customTransactionPlanner).toHaveBeenCalledExactlyOnceWith(expect.any(Object), { abortSignal });
            expect(customTransactionPlanExecutor).not.toHaveBeenCalled();
        });

        it('does not call the planner if the abort signal is already triggered', async () => {
            const customTransactionPlanner = vi.fn();
            const customTransactionPlanExecutor = vi.fn();
            const client = createEmptyClient()
                .use(transactionPlanner(customTransactionPlanner))
                .use(transactionPlanExecutor(customTransactionPlanExecutor))
                .use(planAndSendTransactions());

            const abortController = new AbortController();
            abortController.abort();
            await client.planTransaction({} as Instruction, { abortSignal: abortController.signal }).catch(() => {});
            expect(customTransactionPlanner).not.toHaveBeenCalled();
            expect(customTransactionPlanExecutor).not.toHaveBeenCalled();
        });

        it('accepts instruction plans directly as input', async () => {
            const instructionPlan = sequentialInstructionPlan([{} as Instruction, {} as Instruction]);
            const transactionPlan = singleTransactionPlan({} as TransactionMessage & TransactionMessageWithFeePayer);
            const customTransactionPlanner = vi.fn().mockResolvedValue(transactionPlan);
            const customTransactionPlanExecutor = vi.fn();
            const client = createEmptyClient()
                .use(transactionPlanner(customTransactionPlanner))
                .use(transactionPlanExecutor(customTransactionPlanExecutor))
                .use(planAndSendTransactions());

            await client.planTransaction(instructionPlan);
            expect(customTransactionPlanner).toHaveBeenCalledExactlyOnceWith(instructionPlan, {
                abortSignal: undefined,
            });
            expect(customTransactionPlanExecutor).not.toHaveBeenCalled();
        });
    });

    describe('client.planTransactions', () => {
        it('adds a planTransactions function on the client that plans instructions and returns a transaction plan', async () => {
            const instructions = [{} as Instruction, {} as Instruction];
            const transactionPlan = sequentialTransactionPlan([
                {} as TransactionMessage & TransactionMessageWithFeePayer,
                {} as TransactionMessage & TransactionMessageWithFeePayer,
            ]);

            const customTransactionPlanner = vi.fn().mockResolvedValue(transactionPlan);
            const customTransactionPlanExecutor = vi.fn();
            const client = createEmptyClient()
                .use(transactionPlanner(customTransactionPlanner))
                .use(transactionPlanExecutor(customTransactionPlanExecutor))
                .use(planAndSendTransactions());

            expect(client).toHaveProperty('planTransactions');
            const result = await client.planTransactions(instructions);
            result satisfies TransactionPlan;

            expect(result).toBe(transactionPlan);
            expect(customTransactionPlanner).toHaveBeenCalledExactlyOnceWith(sequentialInstructionPlan(instructions), {
                abortSignal: undefined,
            });
            expect(customTransactionPlanExecutor).not.toHaveBeenCalled();
        });

        it('passes the abort signal through the planner', async () => {
            const transactionPlan = singleTransactionPlan({} as TransactionMessage & TransactionMessageWithFeePayer);
            const customTransactionPlanner = vi.fn().mockResolvedValue(transactionPlan);
            const customTransactionPlanExecutor = vi.fn();
            const client = createEmptyClient()
                .use(transactionPlanner(customTransactionPlanner))
                .use(transactionPlanExecutor(customTransactionPlanExecutor))
                .use(planAndSendTransactions());

            const abortSignal = new AbortController().signal;
            await client.planTransactions({} as Instruction, { abortSignal });
            expect(customTransactionPlanner).toHaveBeenCalledExactlyOnceWith(expect.any(Object), { abortSignal });
            expect(customTransactionPlanExecutor).not.toHaveBeenCalled();
        });

        it('does not call the planner if the abort signal is already triggered', async () => {
            const customTransactionPlanner = vi.fn();
            const customTransactionPlanExecutor = vi.fn();
            const client = createEmptyClient()
                .use(transactionPlanner(customTransactionPlanner))
                .use(transactionPlanExecutor(customTransactionPlanExecutor))
                .use(planAndSendTransactions());

            const abortController = new AbortController();
            abortController.abort();
            await client.planTransactions({} as Instruction, { abortSignal: abortController.signal }).catch(() => {});
            expect(customTransactionPlanner).not.toHaveBeenCalled();
            expect(customTransactionPlanExecutor).not.toHaveBeenCalled();
        });

        it('accepts instruction plans directly as input', async () => {
            const instructionPlan = sequentialInstructionPlan([{} as Instruction, {} as Instruction]);
            const transactionPlan = sequentialTransactionPlan([
                {} as TransactionMessage & TransactionMessageWithFeePayer,
                {} as TransactionMessage & TransactionMessageWithFeePayer,
            ]);
            const customTransactionPlanner = vi.fn().mockResolvedValue(transactionPlan);
            const customTransactionPlanExecutor = vi.fn();
            const client = createEmptyClient()
                .use(transactionPlanner(customTransactionPlanner))
                .use(transactionPlanExecutor(customTransactionPlanExecutor))
                .use(planAndSendTransactions());

            await client.planTransactions(instructionPlan);
            expect(customTransactionPlanner).toHaveBeenCalledExactlyOnceWith(instructionPlan, {
                abortSignal: undefined,
            });
            expect(customTransactionPlanExecutor).not.toHaveBeenCalled();
        });
    });

    describe('client.sendTransaction', () => {
        it('adds a sendTransaction function on the client that plans and executes instructions', async () => {
            const instruction = {} as Instruction;
            const transactionPlan = singleTransactionPlan({} as TransactionMessage & TransactionMessageWithFeePayer);
            const transactionPlanResult = successfulSingleTransactionPlanResult(
                {} as TransactionMessage & TransactionMessageWithFeePayer,
                { signature: 'signature' as Signature },
            );

            const customTransactionPlanner = vi.fn().mockResolvedValue(transactionPlan);
            const customTransactionPlanExecutor = vi.fn().mockResolvedValue(transactionPlanResult);
            const client = createEmptyClient()
                .use(transactionPlanner(customTransactionPlanner))
                .use(transactionPlanExecutor(customTransactionPlanExecutor))
                .use(planAndSendTransactions());

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
                .use(planAndSendTransactions());

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
                successfulSingleTransactionPlanResult({} as TransactionMessage & TransactionMessageWithFeePayer, {
                    signature: 'signature' as Signature,
                }),
            ]);
            const customTransactionPlanner = vi.fn().mockResolvedValue(transactionPlan);
            const customTransactionPlanExecutor = vi.fn().mockResolvedValue(transactionPlanResult);
            const client = createEmptyClient()
                .use(transactionPlanner(customTransactionPlanner))
                .use(transactionPlanExecutor(customTransactionPlanExecutor))
                .use(planAndSendTransactions());

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
                .use(planAndSendTransactions());

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
            const transactionPlanResult = successfulSingleTransactionPlanResult(
                {} as TransactionMessage & TransactionMessageWithFeePayer,
                { signature: 'signature' as Signature },
            );
            const customTransactionPlanner = vi.fn().mockResolvedValue(transactionPlan);
            const customTransactionPlanExecutor = vi.fn().mockResolvedValue(transactionPlanResult);
            const client = createEmptyClient()
                .use(transactionPlanner(customTransactionPlanner))
                .use(transactionPlanExecutor(customTransactionPlanExecutor))
                .use(planAndSendTransactions());

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
                .use(planAndSendTransactions());

            const abortController = new AbortController();
            abortController.abort();
            await client.sendTransaction({} as Instruction, { abortSignal: abortController.signal }).catch(() => {});
            expect(customTransactionPlanner).not.toHaveBeenCalled();
            expect(customTransactionPlanExecutor).not.toHaveBeenCalled();
        });

        it('accepts instruction plans directly as input', async () => {
            const instructionPlan = sequentialInstructionPlan([{} as Instruction, {} as Instruction]);
            const transactionPlan = singleTransactionPlan({} as TransactionMessage & TransactionMessageWithFeePayer);
            const transactionPlanResult = successfulSingleTransactionPlanResult(transactionPlan.message, {
                signature: 'signature' as Signature,
            });
            const customTransactionPlanner = vi.fn().mockResolvedValue(transactionPlan);
            const customTransactionPlanExecutor = vi.fn().mockResolvedValue(transactionPlanResult);
            const client = createEmptyClient()
                .use(transactionPlanner(customTransactionPlanner))
                .use(transactionPlanExecutor(customTransactionPlanExecutor))
                .use(planAndSendTransactions());

            await client.sendTransaction(instructionPlan);
            expect(customTransactionPlanner).toHaveBeenCalledExactlyOnceWith(instructionPlan, {
                abortSignal: undefined,
            });
            expect(customTransactionPlanExecutor).toHaveBeenCalledExactlyOnceWith(transactionPlan, {
                abortSignal: undefined,
            });
        });

        it('accepts transaction messages directly as input', async () => {
            const payer = '1111' as Address;
            const transaction = setTransactionMessageFeePayer(payer, createTransactionMessage({ version: 0 }));
            const transactionPlanResult = successfulSingleTransactionPlanResult(transaction, {
                signature: 'signature' as Signature,
            });
            const customTransactionPlanner = vi.fn();
            const customTransactionPlanExecutor = vi.fn().mockResolvedValue(transactionPlanResult);
            const client = createEmptyClient()
                .use(transactionPlanner(customTransactionPlanner))
                .use(transactionPlanExecutor(customTransactionPlanExecutor))
                .use(planAndSendTransactions());

            await client.sendTransaction(transaction);
            expect(customTransactionPlanner).not.toHaveBeenCalled();
            expect(customTransactionPlanExecutor).toHaveBeenCalledExactlyOnceWith(singleTransactionPlan(transaction), {
                abortSignal: undefined,
            });
        });

        it('accepts single transaction plans directly as input', async () => {
            const payer = '1111' as Address;
            const transactionPlan = singleTransactionPlan(
                setTransactionMessageFeePayer(payer, createTransactionMessage({ version: 0 })),
            );
            const transactionPlanResult = successfulSingleTransactionPlanResult(transactionPlan.message, {
                signature: 'signature' as Signature,
            });
            const customTransactionPlanner = vi.fn();
            const customTransactionPlanExecutor = vi.fn().mockResolvedValue(transactionPlanResult);
            const client = createEmptyClient()
                .use(transactionPlanner(customTransactionPlanner))
                .use(transactionPlanExecutor(customTransactionPlanExecutor))
                .use(planAndSendTransactions());

            await client.sendTransaction(transactionPlan);
            expect(customTransactionPlanner).not.toHaveBeenCalled();
            expect(customTransactionPlanExecutor).toHaveBeenCalledExactlyOnceWith(transactionPlan, {
                abortSignal: undefined,
            });
        });

        it('re-wraps a failed-to-execute error into a failed-to-send-transaction error', async () => {
            const message = {} as TransactionMessage & TransactionMessageWithFeePayer;
            const txPlan = singleTransactionPlan(message);
            const error = new Error('tx failed');
            const failedResult = failedSingleTransactionPlanResult(message, error);
            const executionError = createFailedToExecuteTransactionPlanError(failedResult);

            const customTransactionPlanner = vi.fn().mockResolvedValue(txPlan);
            const customTransactionPlanExecutor = vi.fn().mockRejectedValue(executionError);
            const client = createEmptyClient()
                .use(transactionPlanner(customTransactionPlanner))
                .use(transactionPlanExecutor(customTransactionPlanExecutor))
                .use(planAndSendTransactions());

            const thrownError = await client.sendTransaction({} as Instruction).catch((e: unknown) => e);
            assert(isSolanaError(thrownError, SOLANA_ERROR__FAILED_TO_SEND_TRANSACTION));
        });

        it('unwraps preflight errors when re-wrapping a failed-to-execute error', async () => {
            const message = {} as TransactionMessage & TransactionMessageWithFeePayer;
            const txPlan = singleTransactionPlan(message);
            const innerError = new SolanaError(SOLANA_ERROR__TRANSACTION_ERROR__INSUFFICIENT_FUNDS_FOR_FEE);
            const logs = ['Program log: Error: insufficient funds'];
            const simulationData = {
                accounts: null,
                innerInstructions: null,
                loadedAccountsDataSize: null,
                logs,
                replacementBlockhash: null,
                returnData: null,
                unitsConsumed: 200_000n,
            };
            const preflightError = new SolanaError(
                SOLANA_ERROR__JSON_RPC__SERVER_ERROR_SEND_TRANSACTION_PREFLIGHT_FAILURE,
                { ...simulationData, cause: innerError },
            );
            const failedResult = failedSingleTransactionPlanResult(message, preflightError);
            const executionError = createFailedToExecuteTransactionPlanError(failedResult);

            const customTransactionPlanner = vi.fn().mockResolvedValue(txPlan);
            const customTransactionPlanExecutor = vi.fn().mockRejectedValue(executionError);
            const client = createEmptyClient()
                .use(transactionPlanner(customTransactionPlanner))
                .use(transactionPlanExecutor(customTransactionPlanExecutor))
                .use(planAndSendTransactions());

            const thrownError = await client.sendTransaction({} as Instruction).catch((e: unknown) => e);
            assert(isSolanaError(thrownError, SOLANA_ERROR__FAILED_TO_SEND_TRANSACTION));
            expect(thrownError.context.logs).toBe(logs);
            expect(thrownError.context.preflightData).toMatchObject(simulationData);
            expect(thrownError.cause).toBe(innerError);
        });

        it('re-throws non-Solana errors unchanged', async () => {
            const message = {} as TransactionMessage & TransactionMessageWithFeePayer;
            const txPlan = singleTransactionPlan(message);
            const genericError = new Error('something went wrong');

            const customTransactionPlanner = vi.fn().mockResolvedValue(txPlan);
            const customTransactionPlanExecutor = vi.fn().mockRejectedValue(genericError);
            const client = createEmptyClient()
                .use(transactionPlanner(customTransactionPlanner))
                .use(transactionPlanExecutor(customTransactionPlanExecutor))
                .use(planAndSendTransactions());

            const promise = client.sendTransaction({} as Instruction);
            await expect(promise).rejects.toBe(genericError);
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
                .use(planAndSendTransactions());

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
                .use(planAndSendTransactions());

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
                .use(planAndSendTransactions());

            const abortController = new AbortController();
            abortController.abort();
            await client.sendTransactions({} as Instruction, { abortSignal: abortController.signal }).catch(() => {});
            expect(customTransactionPlanner).not.toHaveBeenCalled();
            expect(customTransactionPlanExecutor).not.toHaveBeenCalled();
        });

        it('accepts instruction plans directly as input', async () => {
            const instructionPlan = sequentialInstructionPlan([{} as Instruction, {} as Instruction]);
            const transactionPlan = sequentialTransactionPlan([
                {} as TransactionMessage & TransactionMessageWithFeePayer,
                {} as TransactionMessage & TransactionMessageWithFeePayer,
            ]);
            const customTransactionPlanner = vi.fn().mockResolvedValue(transactionPlan);
            const customTransactionPlanExecutor = vi.fn();
            const client = createEmptyClient()
                .use(transactionPlanner(customTransactionPlanner))
                .use(transactionPlanExecutor(customTransactionPlanExecutor))
                .use(planAndSendTransactions());

            await client.sendTransactions(instructionPlan);
            expect(customTransactionPlanner).toHaveBeenCalledExactlyOnceWith(instructionPlan, {
                abortSignal: undefined,
            });
            expect(customTransactionPlanExecutor).toHaveBeenCalledExactlyOnceWith(transactionPlan, {
                abortSignal: undefined,
            });
        });

        it('accepts transaction messages directly as input', async () => {
            const payer = '1111' as Address;
            const transaction = setTransactionMessageFeePayer(payer, createTransactionMessage({ version: 0 }));
            const customTransactionPlanner = vi.fn();
            const customTransactionPlanExecutor = vi.fn();
            const client = createEmptyClient()
                .use(transactionPlanner(customTransactionPlanner))
                .use(transactionPlanExecutor(customTransactionPlanExecutor))
                .use(planAndSendTransactions());

            await client.sendTransactions(transaction);
            expect(customTransactionPlanner).not.toHaveBeenCalled();
            expect(customTransactionPlanExecutor).toHaveBeenCalledExactlyOnceWith(singleTransactionPlan(transaction), {
                abortSignal: undefined,
            });
        });

        it('accepts multiple transaction messages directly as input', async () => {
            const transactionA = setTransactionMessageFeePayer(
                '1111' as Address,
                createTransactionMessage({ version: 0 }),
            );
            const transactionB = setTransactionMessageFeePayer(
                '2222' as Address,
                createTransactionMessage({ version: 0 }),
            );
            const customTransactionPlanner = vi.fn();
            const customTransactionPlanExecutor = vi.fn();
            const client = createEmptyClient()
                .use(transactionPlanner(customTransactionPlanner))
                .use(transactionPlanExecutor(customTransactionPlanExecutor))
                .use(planAndSendTransactions());

            await client.sendTransactions([transactionA, transactionB]);
            expect(customTransactionPlanner).not.toHaveBeenCalled();
            expect(customTransactionPlanExecutor).toHaveBeenCalledExactlyOnceWith(
                sequentialTransactionPlan([transactionA, transactionB]),
                { abortSignal: undefined },
            );
        });

        it('accepts transaction plans directly as input', async () => {
            const transactionPlan = sequentialTransactionPlan([
                {} as TransactionMessage & TransactionMessageWithFeePayer,
                {} as TransactionMessage & TransactionMessageWithFeePayer,
            ]);
            const customTransactionPlanner = vi.fn();
            const customTransactionPlanExecutor = vi.fn();
            const client = createEmptyClient()
                .use(transactionPlanner(customTransactionPlanner))
                .use(transactionPlanExecutor(customTransactionPlanExecutor))
                .use(planAndSendTransactions());

            await client.sendTransactions(transactionPlan);
            expect(customTransactionPlanner).not.toHaveBeenCalled();
            expect(customTransactionPlanExecutor).toHaveBeenCalledExactlyOnceWith(transactionPlan, {
                abortSignal: undefined,
            });
        });

        it('re-wraps a failed-to-execute error into a failed-to-send-transactions error', async () => {
            const message = {} as TransactionMessage & TransactionMessageWithFeePayer;
            const txPlan = singleTransactionPlan(message);
            const error = new Error('tx failed');
            const failedResult = failedSingleTransactionPlanResult(message, error);
            const executionError = createFailedToExecuteTransactionPlanError(failedResult);

            const customTransactionPlanner = vi.fn().mockResolvedValue(txPlan);
            const customTransactionPlanExecutor = vi.fn().mockRejectedValue(executionError);
            const client = createEmptyClient()
                .use(transactionPlanner(customTransactionPlanner))
                .use(transactionPlanExecutor(customTransactionPlanExecutor))
                .use(planAndSendTransactions());

            const thrownError = await client.sendTransactions({} as Instruction).catch((e: unknown) => e);
            assert(isSolanaError(thrownError, SOLANA_ERROR__FAILED_TO_SEND_TRANSACTIONS));
        });

        it('unwraps preflight errors when re-wrapping a failed-to-execute error', async () => {
            const message = {} as TransactionMessage & TransactionMessageWithFeePayer;
            const txPlan = singleTransactionPlan(message);
            const innerError = new SolanaError(SOLANA_ERROR__TRANSACTION_ERROR__INSUFFICIENT_FUNDS_FOR_FEE);
            const logs = ['Program log: Error: insufficient funds'];
            const simulationData = {
                accounts: null,
                innerInstructions: null,
                loadedAccountsDataSize: null,
                logs,
                replacementBlockhash: null,
                returnData: null,
                unitsConsumed: 200_000n,
            };
            const preflightError = new SolanaError(
                SOLANA_ERROR__JSON_RPC__SERVER_ERROR_SEND_TRANSACTION_PREFLIGHT_FAILURE,
                { ...simulationData, cause: innerError },
            );
            const failedResult = failedSingleTransactionPlanResult(message, preflightError);
            const executionError = createFailedToExecuteTransactionPlanError(failedResult);

            const customTransactionPlanner = vi.fn().mockResolvedValue(txPlan);
            const customTransactionPlanExecutor = vi.fn().mockRejectedValue(executionError);
            const client = createEmptyClient()
                .use(transactionPlanner(customTransactionPlanner))
                .use(transactionPlanExecutor(customTransactionPlanExecutor))
                .use(planAndSendTransactions());

            const thrownError = await client.sendTransactions({} as Instruction).catch((e: unknown) => e);
            assert(isSolanaError(thrownError, SOLANA_ERROR__FAILED_TO_SEND_TRANSACTIONS));
            expect(thrownError.context.failedTransactions).toHaveLength(1);
            expect(thrownError.context.failedTransactions[0].error).toBe(innerError);
            expect(thrownError.context.failedTransactions[0].logs).toBe(logs);
            expect(thrownError.context.failedTransactions[0].preflightData).toMatchObject(simulationData);
        });

        it('re-throws non-Solana errors unchanged', async () => {
            const message = {} as TransactionMessage & TransactionMessageWithFeePayer;
            const txPlan = singleTransactionPlan(message);
            const genericError = new Error('something went wrong');

            const customTransactionPlanner = vi.fn().mockResolvedValue(txPlan);
            const customTransactionPlanExecutor = vi.fn().mockRejectedValue(genericError);
            const client = createEmptyClient()
                .use(transactionPlanner(customTransactionPlanner))
                .use(transactionPlanExecutor(customTransactionPlanExecutor))
                .use(planAndSendTransactions());

            const promise = client.sendTransactions({} as Instruction);
            await expect(promise).rejects.toBe(genericError);
        });
    });
});
