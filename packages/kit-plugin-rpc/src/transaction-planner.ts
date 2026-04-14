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
 * import { solanaRpcConnection, solanaRpcSubscriptionsConnection, rpcTransactionPlanner, rpcTransactionPlanExecutor } from '@solana/kit-plugin-rpc';
 * import { generatedPayer } from '@solana/kit-plugin-payer';
 *
 * const client = await createClient()
 *     .use(solanaRpcConnection('https://api.mainnet-beta.solana.com'))
 *     .use(solanaRpcSubscriptionsConnection('wss://api.mainnet-beta.solana.com'))
 *     .use(generatedPayer())
 *     .use(rpcTransactionPlanner())
 *     .use(rpcTransactionPlanExecutor());
 * ```
 */
export function rpcTransactionPlanner(
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
                    tx => fillTransactionMessageProvisoryComputeUnitLimit(tx),
                    tx => (config.priorityFees ? setTransactionMessageComputeUnitPrice(config.priorityFees, tx) : tx),
                );
            },
        });

        return extendClient(client, { transactionPlanner });
    };
}
