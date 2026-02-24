import type { FailedTransactionMetadata, LiteSVM, TransactionMetadata } from '@loris-sandbox/litesvm-kit';
import {
    createTransactionPlanExecutor,
    pipe,
    setTransactionMessageLifetimeUsingBlockhash,
    signTransactionMessageWithSigners,
} from '@solana/kit';

import { getSolanaErrorFromLiteSvmFailure } from './transaction-error';

/**
 * Checks whether a `sendTransaction` result is a failed transaction.
 *
 * LiteSVM's `sendTransaction` returns `TransactionMetadata` on success
 * or `FailedTransactionMetadata` on failure. The failure type has an
 * `err` method while the success type does not.
 */
function isFailedTransaction(
    result: FailedTransactionMetadata | TransactionMetadata,
): result is FailedTransactionMetadata {
    return 'err' in result && typeof result.err === 'function';
}

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

        const transactionPlanExecutor = createTransactionPlanExecutor<{
            transactionMetadata: FailedTransactionMetadata | TransactionMetadata;
        }>({
            executeTransactionMessage: async (context, transactionMessage, config) => {
                const latestBlockhash = client.svm.latestBlockhashLifetime();
                const signedTransaction = await pipe(
                    transactionMessage,
                    tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
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

        return { ...client, transactionPlanExecutor };
    };
}
