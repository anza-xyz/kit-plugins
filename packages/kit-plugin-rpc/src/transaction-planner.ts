import {
    appendTransactionMessageInstruction,
    ClientWithPayer,
    createTransactionMessage,
    createTransactionPlanner,
    MicroLamports,
    pipe,
    setTransactionMessageFeePayerSigner,
    TransactionSigner,
} from '@solana/kit';
import {
    fillProvisorySetComputeUnitLimitInstruction,
    getSetComputeUnitPriceInstruction,
} from '@solana-program/compute-budget';

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
 * import { createEmptyClient } from '@solana/kit';
 * import { rpc, rpcTransactionPlanner, rpcTransactionPlanExecutor } from '@solana/kit-plugin-rpc';
 * import { generatedPayer } from '@solana/kit-plugin-payer';
 *
 * const client = await createEmptyClient()
 *     .use(rpc('https://api.mainnet-beta.solana.com'))
 *     .use(generatedPayer())
 *     .use(rpcTransactionPlanner())
 *     .use(rpcTransactionPlanExecutor());
 * ```
 */
export function rpcTransactionPlanner(
    config: {
        /**
         * The transaction signer who will pay for the transaction fees.
         * Defaults to the client's payer or throws if not present.
         */
        payer?: TransactionSigner;
        /**
         * The priority fees to be set on the transaction in micro lamports per compute unit.
         * Defaults to using no priority fees.
         */
        priorityFees?: MicroLamports;
    } = {},
) {
    return <T extends Partial<ClientWithPayer>>(client: T) => {
        const payer = config.payer ?? client.payer;
        if (!payer) {
            throw new Error(
                'A payer is required to create the RPC transaction planner. ' +
                    'Please provide one in the config of this plugin or on the client under `payer`.',
            );
        }

        const transactionPlanner = createTransactionPlanner({
            createTransactionMessage: () => {
                return pipe(
                    createTransactionMessage({ version: 0 }),
                    tx => setTransactionMessageFeePayerSigner(payer, tx),
                    tx => fillProvisorySetComputeUnitLimitInstruction(tx),
                    tx =>
                        config.priorityFees
                            ? appendTransactionMessageInstruction(
                                  getSetComputeUnitPriceInstruction({ microLamports: config.priorityFees }),
                                  tx,
                              )
                            : tx,
                );
            },
        });

        return { ...client, transactionPlanner };
    };
}
