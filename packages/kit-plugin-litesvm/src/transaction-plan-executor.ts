import {
    ClientWithTransactionPlanning,
    createTransactionPlanExecutor,
    getSignatureFromTransaction,
    pipe,
    SendableTransaction,
    Signature,
    signTransactionMessageWithSigners,
    Transaction,
    TransactionMessage,
    TransactionMessageWithBlockhashLifetime,
    TransactionMessageWithFeePayer,
    TransactionPlanExecutor,
    TransactionPlanExecutorConfig,
    TransactionWithLifetime,
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
 * The context carried by transaction plan results from
 * {@link litesvmTransactionPlanSendingExecutor}.
 *
 * The executor records the planned message once its blockhash lifetime is set,
 * then the fully signed transaction and the signature it was sent under, then
 * the LiteSVM metadata the send produced, so a successful result carries all
 * four.
 *
 * @remarks
 * These properties are only guaranteed on successful results. The context is
 * filled in as execution progresses, so a transaction that fails or is canceled
 * part way through carries only what was recorded before it stopped. Kit
 * will soon type these as `Partial`, but does not do so yet.
 *
 * A successful result always carries a {@link TransactionMetadata}, since the
 * executor throws when LiteSVM reports a failure. The type stays a union because
 * a failed result carries the {@link FailedTransactionMetadata} instead, so
 * narrow it with {@link isFailedTransaction} before reading either.
 *
 * @example
 * Annotating a result produced by the executor.
 * ```ts
 * import { SuccessfulSingleTransactionPlanResult } from '@solana/kit';
 * import { isFailedTransaction, SendContext } from '@solana/kit-plugin-litesvm';
 *
 * function logComputeUnits(result: SuccessfulSingleTransactionPlanResult<SendContext>) {
 *     const { signature, transactionMetadata } = result.context;
 *     if (!isFailedTransaction(transactionMetadata)) {
 *         console.log(`${signature} consumed ${transactionMetadata.computeUnitsConsumed()} compute units`);
 *     }
 * }
 * ```
 *
 * @see {@link litesvmTransactionPlanSendingExecutor}
 */
export type SendContext = {
    message: TransactionMessage & TransactionMessageWithBlockhashLifetime & TransactionMessageWithFeePayer;
    signature: Signature;
    transaction: SendableTransaction & Transaction & TransactionWithLifetime;
    transactionMetadata: FailedTransactionMetadata | TransactionMetadata;
};

/**
 * Creates the transaction plan executor installed by
 * {@link litesvmTransactionPlanSendingExecutor}, which signs planned
 * transaction messages and sends them to the client's LiteSVM instance.
 */
function createExecutor(client: { svm: LiteSVM }): TransactionPlanExecutor<SendContext> {
    if (!client.svm) {
        throw new Error(
            'A LiteSVM instance is required on the client to create the LiteSVM transaction plan executor. ' +
                'Please add the LiteSVM plugin to your client before using this plugin.',
        );
    }

    return createTransactionPlanExecutor<SendContext>({
        executeTransactionMessage: async (context, transactionMessage, config) => {
            const signedTransaction = await pipe(
                transactionMessage,
                tx => client.svm.setTransactionMessageLifetimeUsingLatestBlockhash(tx),
                tx => (context.message = tx),
                async tx => await signTransactionMessageWithSigners(tx, config),
            );

            context.transaction = signedTransaction;
            context.signature = getSignatureFromTransaction(signedTransaction);
            const result = client.svm.sendTransaction(signedTransaction);
            context.transactionMetadata = result;
            if (isFailedTransaction(result)) {
                throw getSolanaErrorFromLiteSvmFailure(result);
            }

            return context as SendContext;
        },
    } satisfies TransactionPlanExecutorConfig<SendContext>);
}
