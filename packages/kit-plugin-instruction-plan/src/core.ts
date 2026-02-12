import {
    assertIsSingleTransactionPlan,
    assertIsSuccessfulSingleTransactionPlanResult,
    ClientWithTransactionPlanning,
    ClientWithTransactionSending,
    isTransactionPlan,
    parseInstructionOrTransactionPlanInput,
    parseInstructionPlanInput,
    singleTransactionPlan,
    TransactionPlanExecutor,
    TransactionPlanner,
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
export function planAndSendTransactions() {
    return <T extends { transactionPlanExecutor: TransactionPlanExecutor; transactionPlanner: TransactionPlanner }>(
        client: T,
    ): ClientWithTransactionPlanning & ClientWithTransactionSending & T => ({
        ...client,
        ...getTransactionPlanningAndSendingFunctions(client),
    });
}

function getTransactionPlanningAndSendingFunctions(client: {
    transactionPlanExecutor: TransactionPlanExecutor;
    transactionPlanner: TransactionPlanner;
}): ClientWithTransactionPlanning & ClientWithTransactionSending {
    const planTransactions: ClientWithTransactionPlanning['planTransactions'] = async (input, config = {}) => {
        const instructionPlan = parseInstructionPlanInput(input);
        config?.abortSignal?.throwIfAborted();
        return await client.transactionPlanner(instructionPlan, config);
    };

    const planTransaction: ClientWithTransactionPlanning['planTransaction'] = async (input, config = {}) => {
        const transactionPlan = await planTransactions(input, config);
        assertIsSingleTransactionPlan(transactionPlan);
        return transactionPlan.message;
    };

    const sendTransactions: ClientWithTransactionSending['sendTransactions'] = async (input, config = {}) => {
        const plan = parseInstructionOrTransactionPlanInput(input);
        config?.abortSignal?.throwIfAborted();
        const transactionPlan = isTransactionPlan(plan) ? plan : await planTransactions(plan, config);
        config?.abortSignal?.throwIfAborted();
        return await client.transactionPlanExecutor(transactionPlan, config);
    };

    const sendTransaction: ClientWithTransactionSending['sendTransaction'] = async (input, config = {}) => {
        const plan = parseInstructionOrTransactionPlanInput(input);
        config?.abortSignal?.throwIfAborted();
        const transactionPlan = isTransactionPlan(plan)
            ? plan
            : singleTransactionPlan(await planTransaction(plan, config));
        config?.abortSignal?.throwIfAborted();
        const result = await client.transactionPlanExecutor(transactionPlan, config);
        assertIsSuccessfulSingleTransactionPlanResult(result);
        return result;
    };

    return { planTransaction, planTransactions, sendTransaction, sendTransactions };
}
