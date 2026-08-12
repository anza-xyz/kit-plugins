import {
    ClientWithTransactionPlanning,
    createTransactionPlanExecutor,
    pipe,
    signTransactionMessageWithSigners,
    TransactionPlanExecutor,
} from '@solana/kit';
import { transactionPlanExecutor, transactionPlanSendingExecutor } from '@solana/kit-plugin-instruction-plan';
import type { FailedTransactionMetadata, LiteSVM, TransactionMetadata } from 'litesvm';

import { getSolanaErrorFromLiteSvmFailure, isFailedTransaction } from './transaction-error';

/**
 * A plugin that adds `sendTransaction` and `sendTransactions` to the client
 * using a default transaction plan executor backed by LiteSVM.
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
 * Since sending goes through the client's planning functions,
 * {@link litesvmTransactionPlanner} — or another `transactionPlanner` plugin —
 * must be installed first.
 *
 * @returns A plugin that adds `client.sendTransaction` and `client.sendTransactions`.
 * @throws If the client has no `svm` set, or no transaction planning functions set.
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
 * @see {@link litesvmTransactionPlanner}
 */
export function litesvmTransactionPlanSendingExecutor() {
    return <T extends ClientWithTransactionPlanning & { svm: LiteSVM }>(client: T) =>
        transactionPlanSendingExecutor(createExecutor(client))(client);
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
 * @deprecated Use {@link litesvmTransactionPlanSendingExecutor} instead, which
 * installs `sendTransaction` and `sendTransactions` alongside the executor. This
 * plugin only sets the deprecated `transactionPlanExecutor` field.
 *
 * ```ts
 * // Before
 * const client = await createClient()
 *     .use(litesvmTransactionPlanner())
 *     .use(litesvmTransactionPlanExecutor())
 *     .use(planAndSendTransactions());
 *
 * // After
 * const client = await createClient()
 *     .use(litesvmTransactionPlanner())
 *     .use(litesvmTransactionPlanSendingExecutor());
 * ```
 */
export function litesvmTransactionPlanExecutor() {
    return <T extends { svm: LiteSVM }>(client: T) => transactionPlanExecutor(createExecutor(client))(client);
}

/**
 * Creates the transaction plan executor installed by
 * {@link litesvmTransactionPlanSendingExecutor}, which signs planned
 * transaction messages and sends them to the client's LiteSVM instance.
 */
function createExecutor(client: {
    svm: LiteSVM;
}): TransactionPlanExecutor<{ transactionMetadata: FailedTransactionMetadata | TransactionMetadata }> {
    if (!client.svm) {
        throw new Error(
            'A LiteSVM instance is required on the client to create the LiteSVM transaction plan executor. ' +
                'Please add the LiteSVM plugin to your client before using this plugin.',
        );
    }

    return createTransactionPlanExecutor<{
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
}
