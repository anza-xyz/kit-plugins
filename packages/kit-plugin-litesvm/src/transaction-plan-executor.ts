import {
    Blockhash,
    createTransactionPlanExecutor,
    pipe,
    setTransactionMessageLifetimeUsingBlockhash,
    signTransactionMessageWithSigners,
    Transaction,
    unwrapSimulationError,
} from '@solana/kit';

type LiteSVM = {
    latestBlockhashLifetime: () => { blockhash: Blockhash; lastValidBlockHeight: bigint };
    sendTransaction: (signedTransaction: Transaction) => unknown;
};

/**
 * A plugin that provides a default transaction plan executor using LiteSVM.
 *
 * The executor signs transaction messages and sends them to the LiteSVM instance.
 *
 * @returns A plugin that adds `transactionPlanExecutor` to the client.
 *
 * @example
 * ```ts
 * import { createEmptyClient } from '@solana/kit';
 * import { litesvm, litesvmTransactionPlanner, litesvmTransactionPlanExecutor } from '@solana/kit-plugin-litesvm';
 * import { generatedPayer } from '@solana/kit-plugin-payer';
 *
 * const client = await createEmptyClient()
 *     .use(litesvm())
 *     .use(generatedPayer())
 *     .use(litesvmTransactionPlanner())
 *     .use(litesvmTransactionPlanExecutor());
 * ```
 */
export function litesvmTransactionPlanExecutor() {
    return <T extends { svm: LiteSVM }>(client: T) => {
        if (!client.svm) {
            throw new Error(
                'A LiteSVM instance is required on the client to create the LiteSVM transaction plan executor. ' +
                    'Please add the LiteSVM plugin to your client before using this plugin.',
            );
        }

        const transactionPlanExecutor = createTransactionPlanExecutor({
            executeTransactionMessage: async (context, transactionMessage, config) => {
                try {
                    const latestBlockhash = client.svm.latestBlockhashLifetime();
                    const signedTransaction = await pipe(
                        transactionMessage,
                        tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
                        tx => (context.message = tx),
                        async tx => await signTransactionMessageWithSigners(tx, config),
                    );

                    context.transaction = signedTransaction;
                    client.svm.sendTransaction(signedTransaction);
                    return signedTransaction;
                } catch (error) {
                    throw unwrapSimulationError(error);
                }
            },
        });

        return { ...client, transactionPlanExecutor };
    };
}
