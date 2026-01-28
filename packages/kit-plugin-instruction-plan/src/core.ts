import {
    assertIsSingleTransactionPlan,
    assertIsSuccessfulSingleTransactionPlanResult,
    Instruction,
    InstructionPlan,
    sequentialInstructionPlan,
    singleInstructionPlan,
    SuccessfulSingleTransactionPlanResult,
    TransactionPlanExecutor,
    TransactionPlanner,
    TransactionPlanResult,
} from '@solana/kit';

/**
 * A plugin that sets the transactionPlanner on the client.
 *
 * @example
 * ```ts
 * import { createEmptyClient, createTransactionPlanner } from '@solana/kit';
 * import { transactionPlanner } from '@solana/kit-plugins';
 *
 * // Install the transactionPlanner plugin using a custom transaction planner.
 * const client = createEmptyClient()
 *     .use(transactionPlanner(createTransactionPlanner(...)));
 *
 * // Use the transaction planner.
 * const transactionPlan = await client.transactionPlanner(myInstructionPlan);
 * ```
 */
export function transactionPlanner(transactionPlanner: TransactionPlanner) {
    return <T extends object>(client: T) => ({ ...client, transactionPlanner });
}

/**
 * A plugin that sets the transactionPlanExecutor on the client.
 *
 * @example
 * ```ts
 * import { createEmptyClient, createTransactionPlanExecutor } from '@solana/kit';
 * import { transactionPlanExecutor } from '@solana/kit-plugins';
 *
 * // Install the transactionPlanExecutor plugin using a custom transaction plan executor.
 * const client = createEmptyClient()
 *     .use(transactionPlanExecutor(createTransactionPlanExecutor(...)));
 *
 * // Use the transaction plan executor.
 * const transactionPlanResult = await client.transactionPlanExecutor(myTransactionPlan);
 * ```
 */
export function transactionPlanExecutor(transactionPlanExecutor: TransactionPlanExecutor) {
    return <T extends object>(client: T) => ({ ...client, transactionPlanExecutor });
}

/**
 * A plugin that adds `sendTransaction` and `sendTransactions` functions on the client to
 * plan and execute transaction messages, instructions or instruction plans in one call.
 *
 * This expects the client to have both a `transactionPlanner`
 * and a `transactionPlanExecutor` set.
 *
 * Note that the `sendTransaction` function will assert that the transaction plan result
 * is both successful and contains a single transaction plan. This is slightly different from
 * the `sendTransactions` function which will return the full transaction plan result
 * as produced by the `transactionPlanExecutor`.
 *
 * @example
 * ```ts
 * import { createEmptyClient } from '@solana/kit';
 * import { transactionPlanner, transactionPlanExecutor } from '@solana/kit-plugins';
 *
 * // Install the sendTransactions plugin and its requirements.
 * const client = createEmptyClient()
 *     .use(transactionPlanner(myTransactionPlanner))
 *     .use(transactionPlanExecutor(myTransactionPlanExecutor))
 *     .use(sendTransactions());
 *
 * // Use the sendTransaction(s) functions.
 * const singleResult = await client.sendTransaction(myInstructionPlan);
 * const result = await client.sendTransactions(myInstructionPlan);
 */
export function sendTransactions() {
    return <T extends { transactionPlanExecutor: TransactionPlanExecutor; transactionPlanner: TransactionPlanner }>(
        client: T,
    ) => ({
        ...client,
        sendTransaction: async (
            instructions: Instruction | Instruction[] | InstructionPlan,
            config: {
                abortSignal?: AbortSignal;
                transactionPlanExecutor?: TransactionPlanExecutor;
                transactionPlanner?: TransactionPlanner;
            } = {},
        ): Promise<SuccessfulSingleTransactionPlanResult> => {
            const innerConfig = { abortSignal: config.abortSignal };
            const instructionPlan = getInstructionPlan(instructions);
            config?.abortSignal?.throwIfAborted();
            const transactionPlanner = config.transactionPlanner ?? client.transactionPlanner;
            const transactionPlan = await transactionPlanner(instructionPlan, innerConfig);
            assertIsSingleTransactionPlan(transactionPlan);
            config?.abortSignal?.throwIfAborted();
            const transactionPlanExecutor = config.transactionPlanExecutor ?? client.transactionPlanExecutor;
            const result = await transactionPlanExecutor(transactionPlan, innerConfig);
            assertIsSuccessfulSingleTransactionPlanResult(result);
            return result;
        },
        sendTransactions: async (
            instructions: Instruction | Instruction[] | InstructionPlan,
            config: {
                abortSignal?: AbortSignal;
                transactionPlanExecutor?: TransactionPlanExecutor;
                transactionPlanner?: TransactionPlanner;
            } = {},
        ): Promise<TransactionPlanResult> => {
            const innerConfig = { abortSignal: config.abortSignal };
            const instructionPlan = getInstructionPlan(instructions);
            config?.abortSignal?.throwIfAborted();
            const transactionPlanner = config.transactionPlanner ?? client.transactionPlanner;
            const transactionPlan = await transactionPlanner(instructionPlan, innerConfig);
            config?.abortSignal?.throwIfAborted();
            const transactionPlanExecutor = config.transactionPlanExecutor ?? client.transactionPlanExecutor;
            return await transactionPlanExecutor(transactionPlan, innerConfig);
        },
    });
}

function getInstructionPlan(instructions: Instruction | Instruction[] | InstructionPlan): InstructionPlan {
    if ('kind' in instructions) return instructions;
    if (Array.isArray(instructions)) return sequentialInstructionPlan(instructions);
    return singleInstructionPlan(instructions);
}
