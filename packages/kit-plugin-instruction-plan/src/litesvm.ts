import {
    appendTransactionMessageInstruction,
    Blockhash,
    createTransactionMessage,
    createTransactionPlanExecutor,
    createTransactionPlanner,
    MicroLamports,
    pipe,
    setTransactionMessageFeePayerSigner,
    setTransactionMessageLifetimeUsingBlockhash,
    signTransactionMessageWithSigners,
    Transaction,
    TransactionSigner,
    unwrapSimulationError,
} from '@solana/kit';
import {
    fillProvisorySetComputeUnitLimitInstruction,
    getSetComputeUnitPriceInstruction,
} from '@solana-program/compute-budget';

type LiteSVM = {
    latestBlockhashLifetime: () => { blockhash: Blockhash; lastValidBlockHeight: bigint };
    sendTransaction: (signedTransaction: Transaction) => unknown;
};

/**
 * A plugin that provides a default transactionPlanner and transactionPlanExecutor
 * using an existing LiteSVM instance on the client.
 *
 * It requires a payer to be provided either in the config or set on the client.
 *
 * @example
 * ```ts
 * import { createEmptyClient, createTransactionPlanner } from '@solana/kit';
 * import { transactionPlanner } from '@solana/kit-plugins';
 *
 * // Install the LiteSVM instruction plan plugin and its requirements.
 * const client = await createEmptyClient()
 *     .use(litesvm());
 *     .use(generatedPayer());
 *     .use(defaultTransactionPlannerAndExecutorFromLitesvm());
 *
 * // Use the transaction planner and executor.
 * const transactionPlan = await client.transactionPlanner(myInstructionPlan);
 * const transactionPlanResult = await client.transactionPlanExecutor(myTransactionPlan);
 * ```
 */
export function defaultTransactionPlannerAndExecutorFromLitesvm(
    config: {
        payer?: TransactionSigner;
        priorityFees?: MicroLamports;
    } = {},
) {
    return <T extends { payer?: TransactionSigner; svm: LiteSVM }>(client: T) => {
        if (!client.svm) {
            throw new Error(
                'A LiteSVM instance is required on the client to create a default transaction planner and executor. ' +
                    'Please add the LiteSVM plugin to your client before using this plugin.',
            );
        }

        const payer = config.payer ?? client.payer;
        if (!payer) {
            throw new Error(
                'A payer is required to create the default transaction planner and executor. ' +
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

        const transactionPlanExecutor = createTransactionPlanExecutor({
            executeTransactionMessage: async (transactionMessage, config) => {
                try {
                    const latestBlockhash = client.svm.latestBlockhashLifetime();
                    const signedTransaction = await pipe(
                        transactionMessage,
                        tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
                        async tx => await signTransactionMessageWithSigners(tx, config),
                    );

                    client.svm.sendTransaction(signedTransaction);
                    return { transaction: signedTransaction };
                } catch (error) {
                    throw unwrapSimulationError(error);
                }
            },
        });

        return { ...client, transactionPlanExecutor, transactionPlanner };
    };
}
