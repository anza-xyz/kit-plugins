import { createTransactionPlanExecutor, extendClient, pipe, signTransactionMessageWithSigners } from '@solana/kit';
import type { FailedTransactionMetadata, LiteSVM, TransactionMetadata } from 'litesvm';

import { getSolanaErrorFromLiteSvmFailure, isFailedTransaction } from './transaction-error';

/**
 * A plugin that provides a default transaction plan executor using LiteSVM.
 *
 * The executor signs transaction messages and sends them to the LiteSVM
 * instance. When a transaction fails, the executor throws a `SolanaError`
 * with the same error codes that the RPC executor would produce, allowing
 * consistent error handling across both executors.
 *
 * The executor stores the LiteSVM {@link TransactionMetadata} (or
 * {@link FailedTransactionMetadata} on failure) on
 * `context.transactionMetadata`, allowing consumers to inspect
 * transaction logs, compute units consumed, return data, and other
 * metadata from the plan result.
 *
 * @returns A plugin that adds `transactionPlanExecutor` to the client.
 *
 * @example
 * ```ts
 * import { createClient } from '@solana/kit';
 * import { litesvm, litesvmTransactionPlanner, litesvmTransactionPlanExecutor } from '@solana/kit-plugin-litesvm';
 * import { generatedPayer } from '@solana/kit-plugin-payer';
 *
 * const client = await createClient()
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

        const transactionPlanExecutor = createTransactionPlanExecutor<{
            transactionMetadata: FailedTransactionMetadata | TransactionMetadata;
        }>({
            executeTransactionMessage: async (context, transactionMessage, config) => {
                const signedTransaction = await pipe(
                    transactionMessage,
                    tx => client.svm.setTransactionMessageLifetimeUsingLatestBlockhash(tx),
                    tx => (context.message = tx),
                    async tx => await signTransactionMessageWithSigners(tx, config),
                );

                context.transaction = signedTransaction;
                const result = client.svm.sendTransaction(signedTransaction);
                context.transactionMetadata = result;
                if (isFailedTransaction(result)) {
                    throw getSolanaErrorFromLiteSvmFailure(result);
                }
                return signedTransaction;
            },
        });

        return extendClient(client, { transactionPlanExecutor });
    };
}
