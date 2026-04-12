import { ClientWithPayer, pipe } from '@solana/kit';
import { planAndSendTransactions } from '@solana/kit-plugin-instruction-plan';

import { litesvmAirdrop } from './airdrop';
import { litesvmGetMinimumBalance } from './get-minimum-balance';
import { litesvmConnection } from './litesvm-connection';
import { litesvmTransactionPlanExecutor } from './transaction-plan-executor';
import { litesvmTransactionPlanner } from './transaction-planner';

/**
 * Enhances a client with a full LiteSVM setup including an SVM connection,
 * airdrop support, minimum balance computation, transaction planning, and
 * transaction execution.
 *
 * The client must have a `payer` set before applying this plugin.
 *
 * @return A plugin that adds `client.svm`, `client.rpc`, `client.airdrop`,
 * `client.getMinimumBalance`, `client.transactionPlanner`,
 * `client.transactionPlanExecutor`, and `client.sendTransactions`.
 *
 * @example
 * ```ts
 * import { createClient } from '@solana/kit';
 * import { litesvm } from '@solana/kit-plugin-litesvm';
 * import { payer } from '@solana/kit-plugin-payer';
 *
 * const client = createClient()
 *     .use(payer(myPayer))
 *     .use(litesvm());
 * ```
 *
 * @see {@link litesvmConnection}
 */
export function litesvm() {
    return <T extends ClientWithPayer>(client: T) => {
        return pipe(
            client,
            litesvmConnection(),
            litesvmAirdrop(),
            litesvmGetMinimumBalance(),
            litesvmTransactionPlanner(),
            litesvmTransactionPlanExecutor(),
            planAndSendTransactions(),
        );
    };
}
