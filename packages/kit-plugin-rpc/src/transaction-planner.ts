import {
    ClientWithPayer,
    createTransactionMessage,
    createTransactionPlanner,
    fillTransactionMessageProvisoryResourceLimits,
    Lamports,
    MicroLamports,
    pipe,
    setTransactionMessageComputeUnitPrice,
    setTransactionMessageFeePayerSigner,
    TransactionPlanner,
} from '@solana/kit';
import { transactionPlanner } from '@solana/kit-plugin-instruction-plan';

/**
 * A plugin that provides a default transaction planner using RPC.
 *
 * The planner creates transaction messages with:
 * - The configured fee payer.
 * - Provisory resource limits (a compute unit limit, plus a loaded accounts data
 *   size limit for version 1 transactions) to be estimated later by the executor,
 *   unless `estimateResourceLimits` is `false`.
 * - Optional priority fees.
 *
 * The fee payer is read from `client.payer` lazily, at plan time, so that a
 * dynamic payer (such as a connected wallet) is always respected.
 *
 * @param config - Optional configuration for the planner.
 * @returns A plugin that adds `client.planTransaction` and `client.planTransactions`.
 * @throws If `config.version` is `1`, which `@solana/kit` cannot yet build.
 *
 * @example
 * ```ts
 * import { createClient } from '@solana/kit';
 * import { solanaRpcConnection, rpcTransactionPlanner, rpcTransactionPlanSendingExecutor } from '@solana/kit-plugin-rpc';
 * import { generatedPayer } from '@solana/kit-plugin-signer';
 *
 * const client = await createClient()
 *     .use(solanaRpcConnection({ rpcUrl: 'https://api.mainnet-beta.solana.com' }))
 *     .use(generatedPayer())
 *     .use(rpcTransactionPlanner())
 *     .use(rpcTransactionPlanSendingExecutor());
 * ```
 *
 * @example
 * Disabling resource limit estimation, for transactions that are close to the
 * message size limit.
 *
 * ```ts
 * rpcTransactionPlanner({ estimateResourceLimits: false });
 * ```
 *
 * @see {@link rpcTransactionPlanSendingExecutor}
 */
export function rpcTransactionPlanner(config: TransactionPlannerConfig = {}) {
    return <T extends ClientWithPayer>(client: T) => transactionPlanner(createPlanner(client, config))(client);
}

/**
 * Creates the transaction planner installed by {@link rpcTransactionPlanner}.
 *
 * The fee payer is read from the client at plan time rather than at
 * construction time, so a dynamic `client.payer` is always respected.
 */
function createPlanner(client: ClientWithPayer, config: TransactionPlannerConfig): TransactionPlanner {
    if (config.version === 1) {
        // The v1 transaction path is defined at the type level for forward
        // compatibility, but `createTransactionMessage` cannot yet build v1
        // messages, so we fail loudly rather than silently misbehave.
        throw new Error(
            'Version 1 transactions are not yet supported by `rpcTransactionPlanner`. ' +
                'Use version 0 or legacy transactions for now.',
        );
    }

    const version = config.version ?? 0;
    const estimateResourceLimits = config.estimateResourceLimits ?? true;
    const microLamportsPerComputeUnit = config.microLamportsPerComputeUnit;

    return createTransactionPlanner({
        createTransactionMessage: () => {
            return pipe(
                createTransactionMessage({ version }),
                tx => setTransactionMessageFeePayerSigner(client.payer, tx),
                tx => (estimateResourceLimits ? fillTransactionMessageProvisoryResourceLimits(tx) : tx),
                tx =>
                    microLamportsPerComputeUnit === undefined
                        ? tx
                        : setTransactionMessageComputeUnitPrice(microLamportsPerComputeUnit, tx),
            );
        },
    });
}

/**
 * Configuration options shared by all transaction versions.
 */
type SharedTransactionPlannerConfig = {
    /**
     * Whether to estimate and set resource limits (the compute unit limit and,
     * for version 1 transactions, the loaded accounts data size limit) by
     * simulating the transaction before sending.
     *
     * When `true` (default), the planner reserves provisory resource limits that
     * the executor replaces with estimated values. When `false`, no provisory
     * limits are reserved and the executor does not simulate to estimate them;
     * any explicit resource limits already present on the message are preserved.
     * This is useful for transactions that are close to the message size limit,
     * where adding a compute budget instruction would make an otherwise valid
     * transaction too large.
     *
     * Note that this does not affect preflight. When estimation is disabled and
     * `skipPreflight` is left at its default `false`, the executor still runs a
     * preflight simulation when sending. Set `skipPreflight: true` on the
     * executor to skip all simulation.
     *
     * Defaults to `true`.
     */
    estimateResourceLimits?: boolean;
};

/**
 * Configuration options for the transaction planner when creating legacy or
 * version 0 transaction messages.
 *
 * For these versions, resource limits and priority fees are expressed as compute
 * budget instructions appended to the transaction, which cost message bytes.
 */
export type TransactionPlannerConfigLegacy = SharedTransactionPlannerConfig & {
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
 * For version 1, resource limits and priority fees live in a structured resource
 * header rather than compute budget instructions, and the priority fee is
 * expressed as a total amount in lamports rather than a per-compute-unit price.
 *
 * @remarks
 * Version 1 transactions are not yet buildable by `@solana/kit`, so this branch
 * is currently inert: passing `version: 1` throws at runtime. The shape is
 * defined now so that enabling version 1 later is not a breaking change.
 */
export type TransactionPlannerConfigV1 = SharedTransactionPlannerConfig & {
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
