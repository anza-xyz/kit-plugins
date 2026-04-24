import type { ClientWithTransactionPlanning } from '@solana/kit';

import { useClientCapability } from '../client-capability';
import { type ActionResult, useAction } from './use-action';

type PlanTransactionArgs = Parameters<ClientWithTransactionPlanning['planTransaction']>;
type PlanTransactionResult = Awaited<ReturnType<ClientWithTransactionPlanning['planTransaction']>>;
type PlanTransactionsArgs = Parameters<ClientWithTransactionPlanning['planTransactions']>;
type PlanTransactionsResult = Awaited<ReturnType<ClientWithTransactionPlanning['planTransactions']>>;

/**
 * Plans a single transaction without sending it.
 *
 * Useful for preview-then-send UX (confirmation modal showing fees or
 * writable accounts). The planned message can be consumed from `data`
 * (declarative render flow) or by awaiting `sendAsync` (imperative
 * flow), then handed off to {@link useSendTransaction} once confirmed.
 *
 * @return An {@link ActionResult} whose `send` / `sendAsync` forward to
 *         `client.planTransaction` and produce the planned message.
 * @throws An `Error` at mount if no provider installing
 *         `client.planTransaction` is present.
 *
 * @example
 * ```tsx
 * const { sendAsync: plan } = usePlanTransaction();
 * const message = await plan(instructions);
 * ```
 *
 * @see {@link usePlanTransactions}
 * @see {@link useSendTransaction}
 */
export function usePlanTransaction(): ActionResult<PlanTransactionArgs, PlanTransactionResult> {
    const client = useClientCapability<ClientWithTransactionPlanning>({
        capability: 'planTransaction',
        hookName: 'usePlanTransaction',
        providerHint: 'Mount <RpcProvider> or <LiteSvmProvider>.',
    });
    return useAction(
        (signal, input, config) => client.planTransaction(input, { ...config, abortSignal: signal }),
        [client],
    );
}

/**
 * Plans one or more transactions without sending them.
 *
 * Multi-transaction counterpart to {@link usePlanTransaction}. Produces
 * the full `TransactionPlan` covering every prepared transaction, which
 * can then be sent via {@link useSendTransactions}.
 *
 * @return An {@link ActionResult} whose `send` / `sendAsync` forward to
 *         `client.planTransactions`.
 * @throws An `Error` at mount if no provider installing
 *         `client.planTransactions` is present.
 *
 * @example
 * ```tsx
 * const { sendAsync: planMany } = usePlanTransactions();
 * const plan = await planMany(largeInstructionPlan);
 * ```
 *
 * @see {@link usePlanTransaction}
 * @see {@link useSendTransactions}
 */
export function usePlanTransactions(): ActionResult<PlanTransactionsArgs, PlanTransactionsResult> {
    const client = useClientCapability<ClientWithTransactionPlanning>({
        capability: 'planTransactions',
        hookName: 'usePlanTransactions',
        providerHint: 'Mount <RpcProvider> or <LiteSvmProvider>.',
    });
    return useAction(
        (signal, input, config) => client.planTransactions(input, { ...config, abortSignal: signal }),
        [client],
    );
}
