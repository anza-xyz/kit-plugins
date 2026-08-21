import {
    assertIsSingleTransactionPlan,
    assertIsSingleTransactionPlanResult,
    assertIsSuccessfulSingleTransactionPlanResult,
    CanceledSingleTransactionPlanResult,
    ClientWithTransactionPlanning,
    ClientWithTransactionSending,
    createFailedToSendTransactionError,
    createFailedToSendTransactionsError,
    extendClient,
    FailedSingleTransactionPlanResult,
    isSolanaError,
    isTransactionPlan,
    parseInstructionOrTransactionPlanInput,
    parseInstructionPlanInput,
    singleTransactionPlan,
    SOLANA_ERROR__INSTRUCTION_PLANS__FAILED_TO_EXECUTE_TRANSACTION_PLAN,
    TransactionPlanExecutor,
    TransactionPlanner,
    TransactionPlanResult,
    TransactionPlanResultContext,
    TransactionPlanResultContextWithSignature,
} from '@solana/kit';

/**
 * A plugin that adds `planTransaction` and `planTransactions` functions to the
 * client, using the provided transaction planner.
 *
 * The `planTransactions` function plans instructions, instruction plans or
 * transaction messages into a transaction plan. The `planTransaction` function
 * does the same but asserts that the resulting plan contains a single
 * transaction message, and returns that message.
 *
 * For backwards compatibility this plugin also sets a `transactionPlanner`
 * field on the client, but that field is deprecated in favour of the two
 * functions above.
 *
 * @param transactionPlanner - The transaction planner to plan instructions with.
 * @returns A plugin that adds `client.planTransaction` and `client.planTransactions`.
 *
 * @example
 * ```ts
 * import { createClient, createTransactionPlanner } from '@solana/kit';
 * import { transactionPlanner } from '@solana/kit-plugin-instruction-plan';
 *
 * const client = createClient().use(transactionPlanner(createTransactionPlanner(...)));
 *
 * const transactionPlan = await client.planTransactions(myInstructionPlan);
 * const transactionMessage = await client.planTransaction(myInstructionPlan);
 * ```
 *
 * @see {@link transactionPlanSendingExecutor}
 */
export function transactionPlanner(transactionPlanner: TransactionPlanner) {
    return <T extends object>(client: T) => {
        const additions: ClientWithTransactionPlanning & {
            /** @deprecated Use `planTransaction` or `planTransactions` instead. */
            transactionPlanner: TransactionPlanner;
        } = {
            ...getTransactionPlanningFunctions(transactionPlanner),
            transactionPlanner,
        };
        return extendClient(client, additions);
    };
}

/**
 * A plugin that adds `sendTransaction` and `sendTransactions` functions to the
 * client, using the client's planning functions and the provided transaction
 * plan executor.
 *
 * Both functions accept transaction messages, instructions, instruction plans
 * or transaction plans as input, planning the input first when it is not
 * already a transaction plan. Planning goes through the client's
 * `planTransaction` and `planTransactions` functions, so the
 * {@link transactionPlanner} plugin must be installed first.
 *
 * Note that `sendTransaction` asserts that the transaction plan result is both
 * successful and contains a single transaction. This differs from
 * `sendTransactions`, which returns the full transaction plan result as
 * produced by the executor.
 *
 * For backwards compatibility this plugin also sets a `transactionPlanExecutor`
 * field on the client, but that field is deprecated in favour of the two
 * functions above.
 *
 * @typeParam TContext - The extra context type provided by the transaction plan
 * executor on its transaction plan results. It is inferred from the executor and
 * preserved on the deprecated `transactionPlanExecutor` field.
 *
 * @param transactionPlanExecutor - The transaction plan executor used to execute
 * planned transactions.
 * @returns A plugin that adds `client.sendTransaction` and `client.sendTransactions`.
 * @throws If the client has no `planTransaction` or `planTransactions` set.
 *
 * @example
 * ```ts
 * import { createClient } from '@solana/kit';
 * import { transactionPlanner, transactionPlanSendingExecutor } from '@solana/kit-plugin-instruction-plan';
 *
 * const client = createClient()
 *     .use(transactionPlanner(myTransactionPlanner))
 *     .use(transactionPlanSendingExecutor(myTransactionPlanExecutor));
 *
 * const singleResult = await client.sendTransaction(myInstructionPlan);
 * const result = await client.sendTransactions(myInstructionPlan);
 * ```
 *
 * @see {@link transactionPlanner}
 */
export function transactionPlanSendingExecutor<
    TContext extends TransactionPlanResultContext = TransactionPlanResultContextWithSignature,
>(transactionPlanExecutor: TransactionPlanExecutor<TContext>) {
    return <T extends ClientWithTransactionPlanning>(client: T) => {
        if (!client.planTransaction || !client.planTransactions) {
            throw new Error(
                'Transaction planning functions are required on the client to send transactions. ' +
                    'Please add a transaction planner plugin to your client before using this plugin.',
            );
        }
        const additions: ClientWithTransactionSending<TContext> & {
            /** @deprecated Use `sendTransaction` or `sendTransactions` instead. */
            transactionPlanExecutor: TransactionPlanExecutor<TContext>;
        } = {
            ...getTransactionSendingFunctions(client, transactionPlanExecutor),
            transactionPlanExecutor,
        };
        return extendClient(client, additions);
    };
}

/**
 * A plugin that sets the transactionPlanExecutor on the client.
 *
 * @example
 * ```ts
 * import { createClient, createTransactionPlanExecutor } from '@solana/kit';
 * import { transactionPlanExecutor } from '@solana/kit-plugin-instruction-plan';
 *
 * // Install the transactionPlanExecutor plugin using a custom transaction plan executor.
 * const client = createClient()
 *     .use(transactionPlanExecutor(createTransactionPlanExecutor(...)));
 *
 * // Use the transaction plan executor.
 * const transactionPlanResult = await client.transactionPlanExecutor(myTransactionPlan);
 * ```
 *
 * @typeParam TContext - The extra context type provided by the transaction plan
 * executor on its transaction plan results. It is inferred from the executor and
 * preserved on the `transactionPlanExecutor` field.
 *
 * @deprecated Use {@link transactionPlanSendingExecutor} instead, which installs
 * `sendTransaction` and `sendTransactions` alongside the executor. This plugin
 * only sets the deprecated `transactionPlanExecutor` field.
 *
 * ```ts
 * // Before
 * const client = createClient()
 *     .use(transactionPlanner(myTransactionPlanner))
 *     .use(transactionPlanExecutor(myTransactionPlanExecutor))
 *     .use(planAndSendTransactions());
 *
 * // After
 * const client = createClient()
 *     .use(transactionPlanner(myTransactionPlanner))
 *     .use(transactionPlanSendingExecutor(myTransactionPlanExecutor));
 * ```
 */
export function transactionPlanExecutor<
    TContext extends TransactionPlanResultContext = TransactionPlanResultContextWithSignature,
>(transactionPlanExecutor: TransactionPlanExecutor<TContext>) {
    return <T extends object>(client: T) => extendClient(client, { transactionPlanExecutor });
}

/**
 * A plugin that adds `planTransaction`, `planTransactions`, `sendTransaction` and
 * `sendTransactions` functions on the client to plan and execute transaction messages,
 * instructions or instruction plans.
 *
 * This expects the client to have both a `transactionPlanner`
 * and a `transactionPlanExecutor` set.
 *
 * The `planTransaction` and `planTransactions` functions plan instructions into
 * transaction plans without executing them. The `sendTransaction` and `sendTransactions`
 * functions combine planning and execution in a single call.
 *
 * Note that the `sendTransaction` function will assert that the transaction plan result
 * is both successful and contains a single transaction plan. This is slightly different from
 * the `sendTransactions` function which will return the full transaction plan result
 * as produced by the `transactionPlanExecutor`.
 *
 * @example
 * ```ts
 * import { createClient } from '@solana/kit';
 * import { transactionPlanner, transactionPlanExecutor, planAndSendTransactions } from '@solana/kit-plugin-instruction-plan';
 *
 * // Install the planAndSendTransactions plugin and its requirements.
 * const client = createClient()
 *     .use(transactionPlanner(myTransactionPlanner))
 *     .use(transactionPlanExecutor(myTransactionPlanExecutor))
 *     .use(planAndSendTransactions());
 *
 * // Plan transactions without executing them.
 * const transactionPlan = await client.planTransactions(myInstructionPlan);
 * const transactionMessage = await client.planTransaction(myInstructionPlan);
 *
 * // Plan and execute transactions in one call.
 * const singleResult = await client.sendTransaction(myInstructionPlan);
 * const result = await client.sendTransactions(myInstructionPlan);
 * ```
 *
 * @deprecated No longer needed. {@link transactionPlanner} now installs
 * `planTransaction` and `planTransactions`, and
 * {@link transactionPlanSendingExecutor} installs `sendTransaction` and
 * `sendTransactions`.
 *
 * ```ts
 * // Before
 * const client = createClient()
 *     .use(transactionPlanner(myTransactionPlanner))
 *     .use(transactionPlanExecutor(myTransactionPlanExecutor))
 *     .use(planAndSendTransactions());
 *
 * // After
 * const client = createClient()
 *     .use(transactionPlanner(myTransactionPlanner))
 *     .use(transactionPlanSendingExecutor(myTransactionPlanExecutor));
 * ```
 */
export function planAndSendTransactions() {
    return <T extends { transactionPlanExecutor: TransactionPlanExecutor; transactionPlanner: TransactionPlanner }>(
        client: T,
    ) => {
        const planner: TransactionPlanner = (instructionPlan, config) =>
            client.transactionPlanner(instructionPlan, config);
        const executor: TransactionPlanExecutor = (transactionPlan, config) =>
            client.transactionPlanExecutor(transactionPlan, config);
        const planningFunctions = getTransactionPlanningFunctions(planner);
        return extendClient(client, {
            ...planningFunctions,
            ...getTransactionSendingFunctions(planningFunctions, executor),
        });
    };
}

function getTransactionPlanningFunctions(planner: TransactionPlanner): ClientWithTransactionPlanning {
    const planTransactions: ClientWithTransactionPlanning['planTransactions'] = async (input, config = {}) => {
        const instructionPlan = parseInstructionPlanInput(input);
        config?.abortSignal?.throwIfAborted();
        return await planner(instructionPlan, config);
    };

    const planTransaction: ClientWithTransactionPlanning['planTransaction'] = async (input, config = {}) => {
        const transactionPlan = await planTransactions(input, config);
        assertIsSingleTransactionPlan(transactionPlan);
        return transactionPlan.message;
    };

    return { planTransaction, planTransactions };
}

function getTransactionSendingFunctions<TContext extends TransactionPlanResultContext>(
    client: ClientWithTransactionPlanning,
    executor: TransactionPlanExecutor<TContext>,
): ClientWithTransactionSending<TContext> {
    const sendTransactions: ClientWithTransactionSending<TContext>['sendTransactions'] = async (input, config = {}) => {
        const plan = parseInstructionOrTransactionPlanInput(input);
        config?.abortSignal?.throwIfAborted();
        const transactionPlan = isTransactionPlan(plan) ? plan : await client.planTransactions(plan, config);
        config?.abortSignal?.throwIfAborted();
        try {
            return await executor(transactionPlan, config);
        } catch (error) {
            if (!isSolanaError(error, SOLANA_ERROR__INSTRUCTION_PLANS__FAILED_TO_EXECUTE_TRANSACTION_PLAN)) {
                throw error;
            }
            throw createFailedToSendTransactionsError(
                error.context.transactionPlanResult as TransactionPlanResult,
                error.context.abortReason,
            );
        }
    };

    const sendTransaction: ClientWithTransactionSending<TContext>['sendTransaction'] = async (input, config = {}) => {
        const plan = parseInstructionOrTransactionPlanInput(input);
        config?.abortSignal?.throwIfAborted();
        const transactionPlan = isTransactionPlan(plan)
            ? plan
            : singleTransactionPlan(await client.planTransaction(plan, config));
        config?.abortSignal?.throwIfAborted();
        try {
            const result = await executor(transactionPlan, config);
            assertIsSuccessfulSingleTransactionPlanResult(result);
            return result;
        } catch (error) {
            if (!isSolanaError(error, SOLANA_ERROR__INSTRUCTION_PLANS__FAILED_TO_EXECUTE_TRANSACTION_PLAN)) {
                throw error;
            }
            assertIsSingleTransactionPlanResult(error.context.transactionPlanResult as TransactionPlanResult);
            throw createFailedToSendTransactionError(
                error.context.transactionPlanResult as
                    | CanceledSingleTransactionPlanResult
                    | FailedSingleTransactionPlanResult,
                error.context.abortReason,
            );
        }
    };

    return { sendTransaction, sendTransactions };
}
