import {
    createTransactionPlanExecutor,
    GetLatestBlockhashApi,
    partiallySignTransactionMessageWithSigners,
    Rpc,
    SimulateTransactionApi,
    TransactionPlanExecutorWithTransactions,
} from '@solana/kit';

import { PrepareTransactionMessageConfig, prepareTransactionMessageFactory } from './prepare-transaction-message';

/**
 * Configuration for {@link createRpcTransactionSigningExecutor}.
 */
export type RpcTransactionSigningExecutorConfig = PrepareTransactionMessageConfig & {
    /** The RPC used to fetch blockhashes and to simulate for resource limit estimation. */
    rpc: Rpc<GetLatestBlockhashApi & SimulateTransactionApi>;
};

/**
 * Creates a transaction plan executor that signs transactions without sending them.
 *
 * It does everything {@link createRpcTransactionSendingExecutor} does except broadcast:
 * it assigns the transaction lifetime, estimates and sets resource limits by simulating,
 * and signs. Because it never reaches the network it needs no RPC Subscriptions and
 * imposes no concurrency limit.
 *
 * Signing is partial by design. The returned transactions are not guaranteed to be fully
 * signed, so that other parties can add their signatures before the transaction is sent.
 *
 * @param config - Configuration for the executor.
 * @return A transaction plan executor whose results carry their signed transactions.
 *
 * @example
 * ```ts
 * const transactionSigningExecutor = createRpcTransactionSigningExecutor({ rpc: client.rpc });
 * const result = await transactionSigningExecutor(transactionPlan);
 * ```
 *
 * @see {@link createRpcTransactionSendingExecutor}
 */
export function createRpcTransactionSigningExecutor(
    config: RpcTransactionSigningExecutorConfig,
): TransactionPlanExecutorWithTransactions {
    const prepareTransactionMessage = prepareTransactionMessageFactory(config.rpc, config);

    return createTransactionPlanExecutor({
        executeTransactionMessage: async (context, transactionMessage, executorConfig) => {
            const { message } = await prepareTransactionMessage(context, transactionMessage, executorConfig);
            // Unlike in the sending executor, this assignment isn't load-bearing here: signing
            // is the last thing this executor does, so the only way `traverseSingle`'s catch
            // block could read `context.transaction` after this line is an abort signal losing
            // a race with the signing call below. Nor is it what makes a successful result
            // carry the transaction — Kit's `successfulSingleTransactionPlanResultFromTransaction`
            // builds that context itself from the transaction we return. We keep the assignment
            // anyway, since it costs nothing and keeps the two executors symmetrical.
            return (context.transaction = await partiallySignTransactionMessageWithSigners(message, executorConfig));
        },
    });
}
