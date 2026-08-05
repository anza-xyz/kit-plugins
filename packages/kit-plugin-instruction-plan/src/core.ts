import {
    assertIsSingleTransactionPlan,
    assertIsSingleTransactionPlanResult,
    assertIsSuccessfulSingleTransactionPlanResult,
    CanceledSingleTransactionPlanResult,
    ClientWithTransactionPlanning,
    ClientWithTransactionSending,
    ClientWithTransactionSigning,
    createFailedToSendTransactionError,
    createFailedToSendTransactionsError,
    createFailedToSignTransactionError,
    createFailedToSignTransactionsError,
    extendClient,
    FailedSingleTransactionPlanResult,
    isSolanaError,
    isTransactionPlan,
    parseInstructionOrTransactionPlanInput,
    parseInstructionPlanInput,
    singleTransactionPlan,
    SOLANA_ERROR__INSTRUCTION_PLANS__FAILED_TO_EXECUTE_TRANSACTION_PLAN,
    SuccessfulSingleTransactionPlanResult,
    TransactionPlan,
    TransactionPlanExecutor,
    TransactionPlanExecutorWithTransactions,
    TransactionPlanner,
    TransactionPlanResult,
} from '@solana/kit';

/**
 * A plugin that sets the transactionPlanner on the client.
 *
 * @example
 * ```ts
 * import { createClient, createTransactionPlanner } from '@solana/kit';
 * import { transactionPlanner } from '@solana/kit-plugin-instruction-plan';
 *
 * // Install the transactionPlanner plugin using a custom transaction planner.
 * const client = createClient()
 *     .use(transactionPlanner(createTransactionPlanner(...)));
 *
 * // Use the transaction planner.
 * const transactionPlan = await client.transactionPlanner(myInstructionPlan);
 * ```
 */
export function transactionPlanner(transactionPlanner: TransactionPlanner) {
    return <T extends object>(client: T) => extendClient(client, { transactionPlanner });
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
 */
export function transactionPlanExecutor(transactionPlanExecutor: TransactionPlanExecutor) {
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
 * @deprecated Use {@link transactionPlanning} and {@link transactionSending}, which take
 * the planner and executor explicitly instead of reading them off the client, so signing
 * and sending can use different executors.
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
 *     .use(transactionPlanning({ transactionPlanner: myTransactionPlanner }))
 *     .use(
 *         transactionSending({
 *             transactionPlanner: myTransactionPlanner,
 *             transactionSendingExecutor: myTransactionSendingExecutor,
 *         }),
 *     );
 * ```
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
 */
export function planAndSendTransactions() {
    return <T extends { transactionPlanExecutor: TransactionPlanExecutor; transactionPlanner: TransactionPlanner }>(
        client: T,
    ) =>
        extendClient(client, {
            ...getPlanningFunctions(client.transactionPlanner),
            ...getSendingFunctions(client.transactionPlanner, client.transactionPlanExecutor),
        });
}

// Builds the `planTransaction` and `planTransactions` functions shared by every capability
// that needs to turn instructions or instruction plans into a transaction plan without
// executing it.
function getPlanningFunctions(transactionPlanner: TransactionPlanner): ClientWithTransactionPlanning {
    const planTransactions: ClientWithTransactionPlanning['planTransactions'] = async (input, config = {}) => {
        const instructionPlan = parseInstructionPlanInput(input);
        config?.abortSignal?.throwIfAborted();
        return await transactionPlanner(instructionPlan, config);
    };

    const planTransaction: ClientWithTransactionPlanning['planTransaction'] = async (input, config = {}) => {
        const transactionPlan = await planTransactions(input, config);
        assertIsSingleTransactionPlan(transactionPlan);
        return transactionPlan.message;
    };

    return { planTransaction, planTransactions };
}

/**
 * Plans the given input if needed, executes it, and re-wraps a failed-to-execute error
 * using the given error factory. Shared by the sending and signing capabilities, which
 * differ only in which executor runs and which error they raise.
 *
 * Generic over the executor's result type so that a caller passing a
 * {@link TransactionPlanExecutorWithTransactions} gets back a
 * {@link TransactionPlanResultWithTransactions} rather than the wider
 * {@link TransactionPlanResult}, without a cast.
 */
async function planAndExecuteTransactions<TResult extends TransactionPlanResult>(
    transactionPlanner: TransactionPlanner,
    executor: (transactionPlan: TransactionPlan, config?: { abortSignal?: AbortSignal }) => Promise<TResult>,
    createError: (result: TransactionPlanResult, abortReason?: unknown) => Error,
    input: Parameters<ClientWithTransactionSending['sendTransactions']>[0],
    config: { abortSignal?: AbortSignal },
): Promise<TResult> {
    const { planTransactions } = getPlanningFunctions(transactionPlanner);
    const plan = parseInstructionOrTransactionPlanInput(input);
    config?.abortSignal?.throwIfAborted();
    const transactionPlan = isTransactionPlan(plan) ? plan : await planTransactions(plan, config);
    config?.abortSignal?.throwIfAborted();
    try {
        return await executor(transactionPlan, config);
    } catch (error) {
        if (!isSolanaError(error, SOLANA_ERROR__INSTRUCTION_PLANS__FAILED_TO_EXECUTE_TRANSACTION_PLAN)) {
            throw error;
        }
        throw createError(error.context.transactionPlanResult as TransactionPlanResult, error.context.abortReason);
    }
}

/**
 * The single-transaction counterpart to {@link planAndExecuteTransactions}. The result is
 * always asserted to be a single successful transaction; the plan is only asserted to be a
 * single transaction plan when one had to be built from the input on the instructions
 * branch, so a caller passing an already-built multi-transaction plan is caught at the
 * result rather than the plan.
 *
 * Generic over the executor's result type so that a caller passing a
 * {@link TransactionPlanExecutorWithTransactions} gets back a
 * {@link SuccessfulSingleTransactionPlanResultWithTransaction} rather than the wider
 * {@link SuccessfulSingleTransactionPlanResult}, without a cast.
 */
async function planAndExecuteTransaction<TResult extends TransactionPlanResult>(
    transactionPlanner: TransactionPlanner,
    executor: (transactionPlan: TransactionPlan, config?: { abortSignal?: AbortSignal }) => Promise<TResult>,
    createError: (
        result: CanceledSingleTransactionPlanResult | FailedSingleTransactionPlanResult,
        abortReason?: unknown,
    ) => Error,
    input: Parameters<ClientWithTransactionSending['sendTransaction']>[0],
    config: { abortSignal?: AbortSignal },
): Promise<Extract<TResult, SuccessfulSingleTransactionPlanResult>> {
    const { planTransaction } = getPlanningFunctions(transactionPlanner);
    const plan = parseInstructionOrTransactionPlanInput(input);
    config?.abortSignal?.throwIfAborted();
    const transactionPlan = isTransactionPlan(plan) ? plan : singleTransactionPlan(await planTransaction(plan, config));
    config?.abortSignal?.throwIfAborted();
    try {
        const result = await executor(transactionPlan, config);
        assertIsSuccessfulSingleTransactionPlanResult(result);
        // The transaction guarantee here is carried by `TResult` (the executor's declared
        // return type), not by this assertion: it only checks `kind`/`status` to select the
        // successful discriminant. TypeScript cannot itself verify that the narrowed
        // `TResult & SuccessfulSingleTransactionPlanResult` is assignable to the equivalent,
        // separately-computed `Extract<...>` return type, so the cast bridges that gap.
        return result as Extract<TResult, SuccessfulSingleTransactionPlanResult>;
    } catch (error) {
        if (!isSolanaError(error, SOLANA_ERROR__INSTRUCTION_PLANS__FAILED_TO_EXECUTE_TRANSACTION_PLAN)) {
            throw error;
        }
        assertIsSingleTransactionPlanResult(error.context.transactionPlanResult as TransactionPlanResult);
        throw createError(
            error.context.transactionPlanResult as
                | CanceledSingleTransactionPlanResult
                | FailedSingleTransactionPlanResult,
            error.context.abortReason,
        );
    }
}

// Builds the `sendTransaction` and `sendTransactions` functions on top of the shared
// plan-then-execute helpers, using the sending executor and the failed-to-send errors.
function getSendingFunctions(
    transactionPlanner: TransactionPlanner,
    transactionSendingExecutor: TransactionPlanExecutor,
): ClientWithTransactionSending {
    return {
        sendTransaction: async (input, config = {}) =>
            await planAndExecuteTransaction(
                transactionPlanner,
                transactionSendingExecutor,
                createFailedToSendTransactionError,
                input,
                config,
            ),
        sendTransactions: async (input, config = {}) =>
            await planAndExecuteTransactions(
                transactionPlanner,
                transactionSendingExecutor,
                createFailedToSendTransactionsError,
                input,
                config,
            ),
    };
}

// Builds the `signTransaction` and `signTransactions` functions on top of the shared
// plan-then-execute helpers, using the signing executor and the failed-to-sign errors.
function getSigningFunctions(
    transactionPlanner: TransactionPlanner,
    transactionSigningExecutor: TransactionPlanExecutorWithTransactions,
): ClientWithTransactionSigning {
    return {
        signTransaction: async (input, config = {}) =>
            await planAndExecuteTransaction(
                transactionPlanner,
                transactionSigningExecutor,
                createFailedToSignTransactionError,
                input,
                config,
            ),
        signTransactions: async (input, config = {}) =>
            await planAndExecuteTransactions(
                transactionPlanner,
                transactionSigningExecutor,
                createFailedToSignTransactionsError,
                input,
                config,
            ),
    };
}

/**
 * A plugin that adds `planTransaction` and `planTransactions` to the client, turning
 * transaction messages, instructions or instruction plans into a transaction plan without
 * executing it.
 *
 * Unlike {@link planAndSendTransactions}, the planner is passed explicitly rather than
 * read off the client, and this plugin installs only the planning functions: pair it with
 * {@link transactionSigning} and/or {@link transactionSending} for the capabilities that
 * execute the plan.
 *
 * @param config - The planner to use.
 * @return A plugin adding the planning functions.
 *
 * @example
 * ```ts
 * import { createClient } from '@solana/kit';
 * import { transactionPlanning } from '@solana/kit-plugin-instruction-plan';
 *
 * // Note the `transactionPlanner` config key here is the planner value itself, not the
 * // `transactionPlanner` plugin exported from this same module.
 * const client = createClient().use(transactionPlanning({ transactionPlanner: myTransactionPlanner }));
 *
 * const transactionPlan = await client.planTransactions(myInstructionPlan);
 * const transactionMessage = await client.planTransaction(myInstructionPlan);
 * ```
 *
 * @see {@link transactionSigning}
 * @see {@link transactionSending}
 * @see {@link ClientWithTransactionPlanning}
 */
export function transactionPlanning(config: { transactionPlanner: TransactionPlanner }) {
    return <T extends object>(client: T) => extendClient(client, getPlanningFunctions(config.transactionPlanner));
}

/**
 * A plugin that adds `signTransaction` and `signTransactions` to the client. Both plan the
 * given transaction messages, instructions or instruction plans if needed, then run them
 * through the given signing executor.
 *
 * A planner is required because signing plans before it can sign, but this plugin installs
 * only the signing functions: pair it with {@link transactionPlanning} for `planTransaction`
 * and `planTransactions`, and with {@link transactionSending} to also send the result.
 * Whether the returned transactions end up fully signed depends entirely on the executor
 * passed in.
 *
 * @param config - The planner and the signing executor to use.
 * @return A plugin adding the signing functions.
 *
 * @example
 * ```ts
 * import { createClient } from '@solana/kit';
 * import { transactionSigning } from '@solana/kit-plugin-instruction-plan';
 *
 * const client = createClient().use(
 *     transactionSigning({
 *         transactionPlanner: myTransactionPlanner,
 *         transactionSigningExecutor: myTransactionSigningExecutor,
 *     }),
 * );
 *
 * const signed = await client.signTransaction(myInstruction);
 * ```
 *
 * @see {@link transactionPlanning}
 * @see {@link transactionSending}
 * @see {@link ClientWithTransactionSigning}
 */
export function transactionSigning(config: {
    transactionPlanner: TransactionPlanner;
    transactionSigningExecutor: TransactionPlanExecutorWithTransactions;
}) {
    return <T extends object>(client: T) =>
        extendClient(client, getSigningFunctions(config.transactionPlanner, config.transactionSigningExecutor));
}

/**
 * A plugin that adds `sendTransaction` and `sendTransactions` to the client. Both plan the
 * given transaction messages, instructions or instruction plans if needed, then run them
 * through the given sending executor.
 *
 * A planner is required because sending plans before it can send, but this plugin installs
 * only the sending functions: pair it with {@link transactionPlanning} for `planTransaction`
 * and `planTransactions`, and with {@link transactionSigning} to sign without sending.
 *
 * @param config - The planner and the sending executor to use.
 * @return A plugin adding the sending functions.
 *
 * @example
 * ```ts
 * import { createClient } from '@solana/kit';
 * import { transactionSending } from '@solana/kit-plugin-instruction-plan';
 *
 * const client = createClient().use(
 *     transactionSending({
 *         transactionPlanner: myTransactionPlanner,
 *         transactionSendingExecutor: myTransactionSendingExecutor,
 *     }),
 * );
 *
 * const sent = await client.sendTransaction(myInstruction);
 * ```
 *
 * @see {@link transactionPlanning}
 * @see {@link transactionSigning}
 * @see {@link ClientWithTransactionSending}
 */
export function transactionSending(config: {
    transactionPlanner: TransactionPlanner;
    transactionSendingExecutor: TransactionPlanExecutor;
}) {
    return <T extends object>(client: T) =>
        extendClient(client, getSendingFunctions(config.transactionPlanner, config.transactionSendingExecutor));
}
