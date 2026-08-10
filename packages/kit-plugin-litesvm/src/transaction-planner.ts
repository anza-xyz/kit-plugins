import {
    ClientWithPayer,
    createTransactionMessage,
    createTransactionPlanner,
    Lamports,
    MicroLamports,
    pipe,
    setTransactionMessageComputeUnitPrice,
    setTransactionMessageFeePayerSigner,
    TransactionPlanner,
} from '@solana/kit';
import { transactionPlanner } from '@solana/kit-plugin-instruction-plan';

/**
 * A plugin that provides a default transaction planner using LiteSVM.
 *
 * The planner creates transaction messages with:
 * - The configured fee payer.
 * - Optional priority fees.
 *
 * Unlike the RPC planner, the LiteSVM planner does not estimate resource limits,
 * since LiteSVM executes transactions locally without a simulation-based
 * estimation step.
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
    if (config.version === 1) {
        // The v1 transaction path is defined at the type level for forward
        // compatibility, but `createTransactionMessage` cannot yet build v1
        // messages, so we fail loudly rather than silently misbehave.
        throw new Error(
            'Version 1 transactions are not yet supported by `litesvmTransactionPlanner`. ' +
                'Use version 0 or legacy transactions for now.',
        );
    }

    const version = config.version ?? 0;
    const microLamportsPerComputeUnit = config.microLamportsPerComputeUnit;

    return createTransactionPlanner({
        createTransactionMessage: () => {
            return pipe(
                createTransactionMessage({ version }),
                tx => setTransactionMessageFeePayerSigner(client.payer, tx),
                tx =>
                    microLamportsPerComputeUnit === undefined
                        ? tx
                        : setTransactionMessageComputeUnitPrice(microLamportsPerComputeUnit, tx),
            );
        },
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
 *
 * @remarks
 * Version 1 transactions are not yet buildable by `@solana/kit`, so this branch
 * is currently inert: passing `version: 1` throws at runtime. The shape is
 * defined now so that enabling version 1 later is not a breaking change.
 */
export type TransactionPlannerConfigV1 = {
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
