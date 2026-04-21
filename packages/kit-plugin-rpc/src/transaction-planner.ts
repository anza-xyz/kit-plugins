import {
    ClientWithPayer,
    createTransactionMessage,
    createTransactionPlanner,
    extendClient,
    fillTransactionMessageProvisoryComputeUnitLimit,
    MicroLamports,
    pipe,
    setTransactionMessageComputeUnitPrice,
    setTransactionMessageFeePayerSigner,
} from '@solana/kit';

/**
 * A plugin that provides a default transaction planner using RPC.
 *
 * The planner creates transaction messages with:
 * - The configured fee payer.
 * - A provisory compute unit limit (to be estimated later by the executor).
 * - Optional priority fees.
 *
 * @param config - Optional configuration for the planner.
 * @returns A plugin that adds `transactionPlanner` to the client.
 *
 * @example
 * ```ts
 * import { createClient } from '@solana/kit';
 * import { solanaRpcConnection, rpcTransactionPlanner, rpcTransactionPlanExecutor } from '@solana/kit-plugin-rpc';
 * import { generatedPayer } from '@solana/kit-plugin-payer';
 *
 * const client = await createClient()
 *     .use(solanaRpcConnection({ rpcUrl: 'https://api.mainnet-beta.solana.com' }))
 *     .use(generatedPayer())
 *     .use(rpcTransactionPlanner())
 *     .use(rpcTransactionPlanExecutor());
 * ```
 */
export function rpcTransactionPlanner(config: TransactionPlannerConfig = {}) {
    return <T extends ClientWithPayer>(client: T) => {
        const transactionPlanner = createTransactionPlanner({
            createTransactionMessage: () => {
                return pipe(
                    createTransactionMessage({ version: config.version ?? 0 }),
                    tx => setTransactionMessageFeePayerSigner(client.payer, tx),
                    tx => fillTransactionMessageProvisoryComputeUnitLimit(tx),
                    tx =>
                        config.microLamportsPerComputeUnit
                            ? setTransactionMessageComputeUnitPrice(config.microLamportsPerComputeUnit, tx)
                            : tx,
                );
            },
        });

        return extendClient(client, { transactionPlanner });
    };
}

/**
 * Configuration options for the transaction planner.
 *
 * The `version` field is used to determine the transaction version
 * to use when creating transaction messages and determines the shape
 * of the rest of the configuration options, as some options are only
 * applicable to certain transaction versions.
 */
// TODO(loris): Add support for v1 transactions when `createTransactionMessage` supports them.
// This includes: `version: 1` and `priorityFees?: Lamports` in a new union variant.
export type TransactionPlannerConfig = {
    /**
     * The priority fees to be set on the transaction in micro lamports per compute unit.
     * Defaults to using no priority fees.
     */
    microLamportsPerComputeUnit?: MicroLamports;
    /**
     * The transaction message version to use when creating transaction messages.
     * Defaults to version 0.
     */
    version?: 'legacy' | 0;
};
