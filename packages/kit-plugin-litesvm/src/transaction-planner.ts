import {
    ClientWithPayer,
    createTransactionMessage,
    createTransactionPlanner,
    Lamports,
    MicroLamports,
    pipe,
    setTransactionMessageComputeUnitLimit,
    setTransactionMessageComputeUnitPrice,
    setTransactionMessageFeePayerSigner,
    setTransactionMessageLoadedAccountsDataSizeLimit,
    setTransactionMessagePriorityFeeLamports,
    TransactionPlanner,
} from '@solana/kit';
import { transactionPlanner } from '@solana/kit-plugin-instruction-plan';

/** The maximum compute unit limit a transaction can request from the runtime. */
const MAX_COMPUTE_UNIT_LIMIT = 1_400_000;

/** The maximum loaded accounts data size a transaction can request from the runtime, i.e. 64 MiB. */
const MAX_LOADED_ACCOUNTS_DATA_SIZE_BYTES = 64 * 1024 * 1024;

/**
 * A plugin that provides a default transaction planner using LiteSVM.
 *
 * The planner creates transaction messages with:
 * - The configured fee payer.
 * - Optional priority fees.
 *
 * Unlike the RPC planner, the LiteSVM planner does not estimate resource limits,
 * since LiteSVM executes transactions locally without a simulation-based
 * estimation step. For version 1 transactions — whose unset resource limits are
 * treated as zero by the runtime — the planner writes maximum limits to the
 * resource header by default, which can be overridden via the config.
 *
 * The fee payer is read from `client.payer` lazily, at plan time, so that a
 * dynamic payer (such as a connected wallet) is always respected.
 *
 * @param config - Optional configuration for the planner.
 * @returns A plugin that adds `client.planTransaction` and `client.planTransactions`.
 *
 * @example
 * ```ts
 * import { createClient } from '@solana/kit';
 * import { litesvmConnection, litesvmTransactionPlanner, litesvmTransactionPlanSendingExecutor } from '@solana/kit-plugin-litesvm';
 * import { generatedPayer } from '@solana/kit-plugin-signer';
 *
 * const client = await createClient()
 *     .use(litesvmConnection())
 *     .use(generatedPayer())
 *     .use(litesvmTransactionPlanner())
 *     .use(litesvmTransactionPlanSendingExecutor());
 * ```
 *
 * @see {@link litesvmTransactionPlanSendingExecutor}
 */
export function litesvmTransactionPlanner(config: TransactionPlannerConfig = {}) {
    return <T extends ClientWithPayer>(client: T) => transactionPlanner(createPlanner(client, config))(client);
}

/**
 * Creates the transaction planner installed by {@link litesvmTransactionPlanner}.
 *
 * The fee payer is read from the client at plan time rather than at
 * construction time, so a dynamic `client.payer` is always respected.
 */
function createPlanner(client: ClientWithPayer, config: TransactionPlannerConfig): TransactionPlanner {
    return config.version === 1 ? createV1Planner(client, config) : createLegacyPlanner(client, config);
}

/**
 * Creates a planner that builds version 1 transaction messages, writing the
 * resource limits and priority fee to the resource header.
 *
 * Unset resource limits in a version 1 transaction config are treated as zero
 * by the runtime, and LiteSVM performs no simulation-based estimation step, so
 * the planner writes maximum limits by default to keep local testing
 * frictionless. Both limits can be overridden via the config.
 */
function createV1Planner(client: ClientWithPayer, config: TransactionPlannerConfigV1): TransactionPlanner {
    const {
        computeUnitLimit = MAX_COMPUTE_UNIT_LIMIT,
        loadedAccountsDataSizeLimit = MAX_LOADED_ACCOUNTS_DATA_SIZE_BYTES,
        priorityFeeLamports,
    } = config;
    return createTransactionPlanner({
        createTransactionMessage: () =>
            pipe(
                createTransactionMessage({ version: 1 }),
                tx => setTransactionMessageComputeUnitLimit(computeUnitLimit, tx),
                tx => setTransactionMessageLoadedAccountsDataSizeLimit(loadedAccountsDataSizeLimit, tx),
                tx => setTransactionMessageFeePayerSigner(client.payer, tx),
                tx =>
                    priorityFeeLamports === undefined
                        ? tx
                        : setTransactionMessagePriorityFeeLamports(priorityFeeLamports, tx),
            ),
    });
}

/**
 * Creates a planner that builds legacy or version 0 transaction messages,
 * expressing the priority fee as a `setComputeUnitPrice` instruction.
 */
function createLegacyPlanner(client: ClientWithPayer, config: TransactionPlannerConfigLegacy): TransactionPlanner {
    const { microLamportsPerComputeUnit, version = 0 } = config;
    return createTransactionPlanner({
        createTransactionMessage: () =>
            pipe(
                createTransactionMessage({ version }),
                tx => setTransactionMessageFeePayerSigner(client.payer, tx),
                tx =>
                    microLamportsPerComputeUnit === undefined
                        ? tx
                        : setTransactionMessageComputeUnitPrice(microLamportsPerComputeUnit, tx),
            ),
    });
}

/**
 * Configuration options for the transaction planner when creating legacy or
 * version 0 transaction messages.
 *
 * For these versions, priority fees are expressed as a `setComputeUnitPrice`
 * compute budget instruction appended to the transaction.
 */
export type TransactionPlannerConfigLegacy = {
    /**
     * The priority fee to set on the transaction, in micro-lamports per compute
     * unit, added as a `setComputeUnitPrice` instruction.
     *
     * Defaults to using no priority fees.
     */
    microLamportsPerComputeUnit?: MicroLamports;
    /**
     * The transaction message version to use when creating transaction messages.
     * Defaults to version 0.
     */
    version?: 'legacy' | 0;
};

/**
 * Configuration options for the transaction planner when creating version 1
 * transaction messages.
 *
 * For version 1, priority fees live in a structured resource header rather than
 * a compute budget instruction, and are expressed as a total amount in lamports
 * rather than a per-compute-unit price.
 */
export type TransactionPlannerConfigV1 = {
    /**
     * The compute unit limit to set on the transaction, written to the
     * version 1 resource header.
     *
     * Unset limits are treated as zero by the runtime and LiteSVM performs no
     * estimation step, so this defaults to the maximum limit of 1,400,000
     * compute units.
     */
    computeUnitLimit?: number;
    /**
     * The loaded accounts data size limit to set on the transaction, in bytes,
     * written to the version 1 resource header.
     *
     * Unset limits are treated as zero by the runtime and LiteSVM performs no
     * estimation step, so this defaults to the maximum limit of 64 MiB.
     */
    loadedAccountsDataSizeLimit?: number;
    /**
     * The total priority fee to set on the transaction, in lamports, written to
     * the version 1 resource header.
     *
     * Defaults to using no priority fees.
     */
    priorityFeeLamports?: Lamports;
    /**
     * The transaction message version to use when creating transaction messages.
     */
    version: 1;
};

/**
 * Configuration options for the transaction planner.
 *
 * The `version` field determines the transaction version to use when creating
 * transaction messages and discriminates the shape of the rest of the
 * configuration, as some options are only applicable to certain versions.
 *
 * @see {@link TransactionPlannerConfigLegacy}
 * @see {@link TransactionPlannerConfigV1}
 */
export type TransactionPlannerConfig = TransactionPlannerConfigLegacy | TransactionPlannerConfigV1;
