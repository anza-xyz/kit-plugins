import { ClientWithPayer, pipe } from '@solana/kit';

import { litesvmAirdrop } from './airdrop';
import { litesvmGetMinimumBalance } from './get-minimum-balance';
import { litesvmConnection } from './litesvm-connection';
import {
    litesvmTransactionPlanSendingExecutor,
    litesvmTransactionPlanSigningExecutor,
} from './transaction-plan-executor';
import { litesvmTransactionPlanner, TransactionPlannerConfig } from './transaction-planner';

/** Configuration for the {@link litesvm} plugin. */
export type LiteSvmConfig = {
    /**
     * Options to configure how transaction messages are created such as
     * choosing a transaction version or setting priority fees.
     */
    transactionConfig?: TransactionPlannerConfig;
};

/**
 * Enhances a client with a full LiteSVM setup including an SVM connection,
 * airdrop support, minimum balance computation, transaction planning,
 * transaction signing, and transaction execution.
 *
 * The client must have a `payer` set before applying this plugin.
 *
 * @return A plugin that adds `client.svm`, `client.rpc`, `client.airdrop`,
 * `client.getMinimumBalance`, `client.planTransaction`, `client.planTransactions`,
 * `client.signTransaction`, `client.signTransactions`, `client.sendTransaction`
 * and `client.sendTransactions`.
 *
 * @example
 * ```ts
 * import { createClient } from '@solana/kit';
 * import { litesvm } from '@solana/kit-plugin-litesvm';
 * import { payer } from '@solana/kit-plugin-signer';
 *
 * const client = createClient()
 *     .use(payer(myPayer))
 *     .use(litesvm());
 * ```
 *
 * @see {@link litesvmConnection}
 */
export function litesvm(config: LiteSvmConfig = {}) {
    return <T extends ClientWithPayer>(client: T) =>
        pipe(
            client,
            litesvmConnection(),
            litesvmAirdrop(),
            litesvmGetMinimumBalance(),
            litesvmTransactionPlanner(config.transactionConfig),
            litesvmTransactionPlanSigningExecutor(),
            litesvmTransactionPlanSendingExecutor(),
        );
}
