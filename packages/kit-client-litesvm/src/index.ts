import { createClient as createEmptyClient, TransactionSigner } from '@solana/kit';
import { planAndSendTransactions } from '@solana/kit-plugin-instruction-plan';
import {
    litesvmAirdrop,
    litesvmConnection,
    litesvmGetMinimumBalance,
    litesvmTransactionPlanExecutor,
    litesvmTransactionPlanner,
} from '@solana/kit-plugin-litesvm';
import { payerOrGeneratedPayer } from '@solana/kit-plugin-payer';

// Re-export types that appear in the `createClient` return type to make them type-portable.
export type {
    FailedTransactionMetadata,
    LiteSVM,
    LiteSvmRpcApi,
    TransactionMetadata,
} from '@solana/kit-plugin-litesvm';

/**
 * Creates a default LiteSVM client for local blockchain simulation.
 *
 * @deprecated Add a payer to your client using any payer plugin from
 * `@solana/kit-plugin-payer`, then use `litesvm` from `@solana/kit-plugin-litesvm`.
 * ```ts
 * import { createClient, lamports } from '@solana/kit';
 * import { litesvm } from '@solana/kit-plugin-litesvm';
 * import { generatedPayer } from '@solana/kit-plugin-payer';
 *
 * const client = await createClient()
 *     .use(generatedPayer())
 *     .use(litesvm());
 * await client.airdrop(client.payer.address, lamports(10_000_000_000n));
 * ```
 */
export function createClient(config: { payer?: TransactionSigner } = {}) {
    return createEmptyClient()
        .use(litesvmConnection())
        .use(litesvmAirdrop())
        .use(litesvmGetMinimumBalance())
        .use(payerOrGeneratedPayer(config.payer))
        .use(litesvmTransactionPlanner())
        .use(litesvmTransactionPlanExecutor())
        .use(planAndSendTransactions());
}
