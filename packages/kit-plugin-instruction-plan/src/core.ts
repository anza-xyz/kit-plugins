import {
    getSolanaErrorFromTransactionError,
    Instruction,
    InstructionPlan,
    isSolanaError,
    sequentialInstructionPlan,
    singleInstructionPlan,
    SOLANA_ERROR__INSTRUCTION_PLANS__FAILED_TO_EXECUTE_TRANSACTION_PLAN,
    SOLANA_ERROR__TRANSACTION__FAILED_WHEN_SIMULATING_TO_ESTIMATE_COMPUTE_LIMIT,
    SolanaError,
    TransactionError,
    TransactionPlan,
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
 * A plugin that adds a `send` function on the client to
 * plan and execute instruction plans in one call.
 *
 * This expects the client to have both a `transactionPlanner`
 * and a `transactionPlanExecutor` set.
 *
 * @example
 * ```ts
 * import { createEmptyClient } from '@solana/kit';
 * import { transactionPlanExecutor } from '@solana/kit-plugins';
 *
 * // Install the sendInstructionPlans plugin and its requirements.
 * const client = createEmptyClient()
 *     .use(transactionPlanner(myTransactionPlanner))
 *     .use(transactionPlanExecutor(myTransactionPlanExecutor))
 *     .use(sendInstructionPlans());
 *
 * // Use the send function.
 * const transactionPlanResult = await client.send(myInstructionPlan);
 */
export function sendInstructionPlans() {
    return <T extends { transactionPlanExecutor: TransactionPlanExecutor; transactionPlanner: TransactionPlanner }>(
        client: T,
    ) => ({
        ...client,
        send: async (
            instructions: Instruction | Instruction[] | InstructionPlan,
            config: {
                abortSignal?: AbortSignal;
                transactionPlanExecutor?: TransactionPlanExecutor;
                transactionPlanner?: TransactionPlanner;
            } = {},
        ) => {
            const innerConfig = { abortSignal: config.abortSignal };
            const instructionPlan = getInstructionPlan(instructions);
            config?.abortSignal?.throwIfAborted();
            const transactionPlanner = config.transactionPlanner ?? client.transactionPlanner;
            const transactionPlan = await transactionPlanner(instructionPlan, innerConfig);
            config?.abortSignal?.throwIfAborted();
            const transactionPlanExecutor = config.transactionPlanExecutor ?? client.transactionPlanExecutor;
            return await transactionPlanExecutor(transactionPlan, innerConfig).catch(unwrapSimulationError);
        },
    });
}

export function sendTransaction() {
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
        ) => {
            const innerConfig = { abortSignal: config.abortSignal };
            const instructionPlan = getInstructionPlan(instructions);
            config?.abortSignal?.throwIfAborted();
            const transactionPlanner = config.transactionPlanner ?? client.transactionPlanner;
            const transactionPlan = await transactionPlanner(instructionPlan, innerConfig);
            assertIsSingleTransactionPlan(transactionPlan);

            config?.abortSignal?.throwIfAborted();
            const transactionPlanExecutor = config.transactionPlanExecutor ?? client.transactionPlanExecutor;
            const result = await transactionPlanExecutor(transactionPlan, innerConfig)
                // TODO: we probably want a custom error type here, that unwraps
                // `SOLANA_ERROR__INSTRUCTION_PLANS__FAILED_TO_EXECUTE_TRANSACTION_PLAN`:
                // - Get the `transactionMessage` from the first failed transaction
                // - Return `e.cause` + `transactionMessage` with a named SendTransactionError
                .catch(unwrapSimulationError);
            // TODO: can we tighten the types in Kit so that single transaction plan -> single transaction plan result? Does that hold?
            if (result.kind === 'single') {
                return result.status;
            } else {
                // TODO: can this happen other than by a type mismatch?
                // Whatever error this throws should include the result, since some/all transactions may have been executed
                throw new Error('Unexpected multiple transaction plan result for single transaction plan.');
            }
        },
    });
}

function getInstructionPlan(instructions: Instruction | Instruction[] | InstructionPlan): InstructionPlan {
    if ('kind' in instructions) return instructions;
    if (Array.isArray(instructions)) return sequentialInstructionPlan(instructions);
    return singleInstructionPlan(instructions);
}

function assertIsSingleTransactionPlan(
    transactionPlan: TransactionPlan,
): asserts transactionPlan is TransactionPlan & { kind: 'single' } {
    if (transactionPlan.kind !== 'single') {
        // TODO: how should we do errors in kit-plugins?
        throw new Error('Instructions do not fit in a single transaction. Use `send` instead.');
    }
}

function unwrapSimulationError(e: unknown): never {
    if (isSolanaError(e, SOLANA_ERROR__INSTRUCTION_PLANS__FAILED_TO_EXECUTE_TRANSACTION_PLAN)) {
        if (isSolanaError(e.cause, SOLANA_ERROR__TRANSACTION__FAILED_WHEN_SIMULATING_TO_ESTIMATE_COMPUTE_LIMIT)) {
            const transactionError = e.cause.cause as TransactionError;
            const nestedError = getSolanaErrorFromTransactionError(transactionError);

            throw new SolanaError(SOLANA_ERROR__INSTRUCTION_PLANS__FAILED_TO_EXECUTE_TRANSACTION_PLAN, {
                cause: nestedError,
                transactionPlanResult: e.context.transactionPlanResult,
            });
        }
    }
    throw e;
}
