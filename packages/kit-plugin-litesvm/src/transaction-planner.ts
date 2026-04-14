import {
    ClientWithPayer,
    createTransactionMessage,
    createTransactionPlanner,
    extendClient,
    MicroLamports,
    pipe,
    setTransactionMessageComputeUnitPrice,
    setTransactionMessageFeePayerSigner,
} from '@solana/kit';

/**
 * A plugin that provides a default transaction planner using LiteSVM.
 *
 * The planner creates transaction messages with:
 * - The configured fee payer.
 * - Optional priority fees.
 *
 * @param config - Optional configuration for the planner.
 * @returns A plugin that adds `transactionPlanner` to the client.
 *
 * @example
 * ```ts
 * import { createClient } from '@solana/kit';
 * import { litesvmConnection, litesvmTransactionPlanner, litesvmTransactionPlanExecutor } from '@solana/kit-plugin-litesvm';
 * import { generatedPayer } from '@solana/kit-plugin-payer';
 *
 * const client = await createClient()
 *     .use(litesvmConnection())
 *     .use(generatedPayer())
 *     .use(litesvmTransactionPlanner())
 *     .use(litesvmTransactionPlanExecutor());
 * ```
 */
export function litesvmTransactionPlanner(
    config: {
        /**
         * The priority fees to be set on the transaction in micro lamports per compute unit.
         * Defaults to using no priority fees.
         */
        priorityFees?: MicroLamports;
    } = {},
) {
    return <T extends ClientWithPayer>(client: T) => {
        const transactionPlanner = createTransactionPlanner({
            createTransactionMessage: () => {
                return pipe(
                    createTransactionMessage({ version: 0 }),
                    tx => setTransactionMessageFeePayerSigner(client.payer, tx),
                    tx => (config.priorityFees ? setTransactionMessageComputeUnitPrice(config.priorityFees, tx) : tx),
                );
            },
        });

        return extendClient(client, { transactionPlanner });
    };
}
