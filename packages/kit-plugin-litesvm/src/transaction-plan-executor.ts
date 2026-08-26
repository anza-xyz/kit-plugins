import {
    Base64EncodedWireTransaction,
    ClientWithTransactionPlanning,
    createTransactionPlanExecutor,
    createTransactionPlanExecutorWithConcurrentLeaves,
    getBase64EncodedWireTransaction,
    getSignatureFromTransaction,
    isFullySignedTransaction,
    partiallySignTransactionMessageWithSigners,
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
    TransactionWithinSizeLimit,
    TransactionWithLifetime,
} from '@solana/kit';
import {
    transactionPlanExecutor,
    transactionPlanSendingExecutor,
    transactionPlanSigningExecutor,
} from '@solana/kit-plugin-instruction-plan';
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
        transactionPlanSendingExecutor(createSendingExecutor(client))(client);
}

/**
 * A plugin that adds `signTransaction` and `signTransactions` to the client
 * using a transaction plan executor backed by LiteSVM.
 *
 * The executor sets each message's lifetime from LiteSVM, partially signs every
 * transaction in the plan, and simulates fully signed transactions to collect
 * transaction metadata without committing state changes. Transaction plan
 * execution constraints are ignored during signing, so every transaction is
 * prepared and signed concurrently. A failed simulation is recorded as
 * {@link FailedTransactionMetadata} but does not make signing fail.
 *
 * Since signing goes through the client's planning functions,
 * {@link litesvmTransactionPlanner} or another `transactionPlanner` plugin must
 * be installed first.
 *
 * @returns A plugin that adds `client.signTransaction` and `client.signTransactions`.
 * @throws If the client has no LiteSVM instance or no transaction planning functions set.
 *
 * @example
 * ```ts
 * import { createClient } from '@solana/kit';
 * import { litesvmConnection, litesvmTransactionPlanner, litesvmTransactionPlanSigningExecutor } from '@solana/kit-plugin-litesvm';
 * import { generatedPayer } from '@solana/kit-plugin-signer';
 *
 * const client = await createClient()
 *     .use(litesvmConnection())
 *     .use(generatedPayer())
 *     .use(litesvmTransactionPlanner())
 *     .use(litesvmTransactionPlanSigningExecutor());
 *
 * const result = await client.signTransactions(myInstructionPlan);
 * ```
 *
 * @see {@link litesvmTransactionPlanner}
 * @see {@link litesvmTransactionPlanSendingExecutor}
 */
export function litesvmTransactionPlanSigningExecutor() {
    return <T extends ClientWithTransactionPlanning & { svm: LiteSVM }>(client: T) =>
        transactionPlanSigningExecutor(createSigningExecutor(client))(client);
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
    return <T extends { svm: LiteSVM }>(client: T) => transactionPlanExecutor(createSendingExecutor(client))(client);
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
 * part way through carries only what was recorded before it stopped.
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
 * import { isFailedTransaction, LiteSvmSendContext } from '@solana/kit-plugin-litesvm';
 *
 * function logComputeUnits(result: SuccessfulSingleTransactionPlanResult<LiteSvmSendContext>) {
 *     const { signature, transactionMetadata } = result.context;
 *     if (!isFailedTransaction(transactionMetadata)) {
 *         console.log(`${signature} consumed ${transactionMetadata.computeUnitsConsumed()} compute units`);
 *     }
 * }
 * ```
 *
 * @see {@link litesvmTransactionPlanSendingExecutor}
 */
export type LiteSvmSendContext = {
    message: TransactionMessage & TransactionMessageWithBlockhashLifetime & TransactionMessageWithFeePayer;
    signature: Signature;
    transaction: SendableTransaction & Transaction & TransactionWithLifetime;
    transactionMetadata: FailedTransactionMetadata | TransactionMetadata;
};

/**
 * The context carried by transaction plan results from
 * {@link litesvmTransactionPlanSigningExecutor}.
 *
 * The executor records the transaction message after setting its blockhash,
 * plus the transaction after applying every available signer and its
 * Base64-encoded wire representation. The signature is present when the fee
 * payer signed. Fully signed transactions are also simulated, in which case
 * the simulation metadata is present. A failed simulation remains a successful
 * signing result with {@link FailedTransactionMetadata} in the context.
 *
 * @remarks
 * These properties are only guaranteed on successful results. Failed and
 * canceled results carry the values recorded before signing or simulation
 * stopped. A partially signed transaction cannot be simulated while LiteSVM
 * signature verification is enabled, so its successful context omits
 * `transactionMetadata`.
 *
 * @example
 * ```ts
 * import { SuccessfulSingleTransactionPlanResult } from '@solana/kit';
 * import { isFailedTransaction, LiteSvmSignContext } from '@solana/kit-plugin-litesvm';
 *
 * function inspectSignedTransaction(result: SuccessfulSingleTransactionPlanResult<LiteSvmSignContext>) {
 *     console.log(result.context.transactionBase64);
 *     const metadata = result.context.transactionMetadata;
 *     if (metadata && !isFailedTransaction(metadata)) {
 *         console.log(metadata.logs());
 *     }
 * }
 * ```
 *
 * @see {@link litesvmTransactionPlanSigningExecutor}
 */
export type LiteSvmSignContext = {
    message: TransactionMessage & TransactionMessageWithBlockhashLifetime & TransactionMessageWithFeePayer;
    signature?: Signature;
    transaction: Transaction & TransactionWithinSizeLimit & TransactionWithLifetime;
    transactionBase64: Base64EncodedWireTransaction;
    transactionMetadata?: FailedTransactionMetadata | TransactionMetadata;
};

/**
 * Creates the transaction plan executor installed by
 * {@link litesvmTransactionPlanSendingExecutor}, which signs planned
 * transaction messages and sends them to the client's LiteSVM instance.
 */
function createSendingExecutor(client: { svm: LiteSVM }): TransactionPlanExecutor<LiteSvmSendContext> {
    if (!client.svm) {
        throw new Error(
            'A LiteSVM instance is required on the client to create the LiteSVM transaction plan executor. ' +
                'Please add the LiteSVM plugin to your client before using this plugin.',
        );
    }

    return createTransactionPlanExecutor<LiteSvmSendContext>({
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

            return context as LiteSvmSendContext;
        },
    } satisfies TransactionPlanExecutorConfig<LiteSvmSendContext>);
}

/** Creates the transaction plan executor installed by {@link litesvmTransactionPlanSigningExecutor}. */
function createSigningExecutor(client: { svm: LiteSVM }): TransactionPlanExecutor<LiteSvmSignContext> {
    if (!client.svm) {
        throw new Error(
            'A LiteSVM instance is required on the client to create the LiteSVM transaction plan signing executor. ' +
                'Please add the LiteSVM plugin to your client before using this plugin.',
        );
    }

    return createTransactionPlanExecutorWithConcurrentLeaves<LiteSvmSignContext>({
        executeTransactionMessage: async (context, transactionMessage, executorConfig = {}) => {
            const message = client.svm.setTransactionMessageLifetimeUsingLatestBlockhash(transactionMessage);
            context.message = message;
            const transaction = await partiallySignTransactionMessageWithSigners(message, executorConfig);
            context.transaction = transaction;
            const transactionBase64 = getBase64EncodedWireTransaction(transaction);
            context.transactionBase64 = transactionBase64;
            const signature = Object.values(transaction.signatures)[0]
                ? getSignatureFromTransaction(transaction)
                : undefined;
            if (signature) {
                context.signature = signature;
            }
            let transactionMetadata: FailedTransactionMetadata | TransactionMetadata | undefined;
            if (isFullySignedTransaction(transaction)) {
                const simulationResult = client.svm.simulateTransaction(transaction);
                transactionMetadata = isFailedTransaction(simulationResult)
                    ? simulationResult
                    : simulationResult.meta();
                context.transactionMetadata = transactionMetadata;
            }

            return {
                ...(signature ? { signature } : {}),
                ...(transactionMetadata !== undefined ? { transactionMetadata } : {}),
                message,
                transaction,
                transactionBase64,
            };
        },
    } satisfies TransactionPlanExecutorConfig<LiteSvmSignContext>);
}
