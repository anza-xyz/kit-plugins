import type { ClientWithTransactionSending } from '@solana/kit';

import { useClientCapability } from '../client-capability';
import { type ActionResult, useAction } from './use-action';

type SendTransactionArgs = Parameters<ClientWithTransactionSending['sendTransaction']>;
type SendTransactionResult = Awaited<ReturnType<ClientWithTransactionSending['sendTransaction']>>;
type SendTransactionsArgs = Parameters<ClientWithTransactionSending['sendTransactions']>;
type SendTransactionsResult = Awaited<ReturnType<ClientWithTransactionSending['sendTransactions']>>;

/**
 * Sends a single transaction with abort and state tracking.
 *
 * Accepts any input supported by `client.sendTransaction` (instructions,
 * instruction plans, pre-built transaction messages, or single-transaction
 * plans). Double-click supersedes: a second `send(...)` while the first
 * is in flight aborts the first via its per-dispatch `AbortSignal`.
 *
 * @return An {@link ActionResult} whose `send` forwards to
 *         `client.sendTransaction` and whose state tracks the send.
 * @throws An `Error` at mount if no provider installing
 *         `client.sendTransaction` is present.
 *
 * @example
 * ```tsx
 * const { send, isRunning, data, error } = useSendTransaction();
 * // Fire-and-forget from an event handler:
 * <button onClick={() => send(getTransferInstruction({ source, destination, amount }))}>
 *     Send
 * </button>
 * ```
 *
 * @see {@link useSendTransactions}
 * @see {@link usePlanTransaction}
 */
export function useSendTransaction(): ActionResult<SendTransactionArgs, SendTransactionResult> {
    const client = useClientCapability<ClientWithTransactionSending>({
        capability: 'sendTransaction',
        hookName: 'useSendTransaction',
        providerHint:
            'Mount <RpcProvider> or <LiteSvmProvider> (or another provider that installs transaction execution).',
    });
    return useAction(
        (signal, input, config) => client.sendTransaction(input, { ...config, abortSignal: signal }),
        [client],
    );
}

/**
 * Sends one or more transactions, batching as the plan requires.
 *
 * Multi-transaction counterpart to {@link useSendTransaction}. Accepts the
 * same flexible input shape but resolves to the full `TransactionPlanResult`
 * covering every submitted transaction.
 *
 * @return An {@link ActionResult} whose `send` forwards to
 *         `client.sendTransactions` and whose state tracks the send.
 * @throws An `Error` at mount if no provider installing
 *         `client.sendTransactions` is present.
 *
 * @example
 * ```tsx
 * const { send, isRunning } = useSendTransactions();
 * <button onClick={() => send(largeInstructionPlan)} disabled={isRunning}>
 *     Send
 * </button>
 * ```
 *
 * @see {@link useSendTransaction}
 */
export function useSendTransactions(): ActionResult<SendTransactionsArgs, SendTransactionsResult> {
    const client = useClientCapability<ClientWithTransactionSending>({
        capability: 'sendTransactions',
        hookName: 'useSendTransactions',
        providerHint: 'Mount <RpcProvider> or <LiteSvmProvider>.',
    });
    return useAction(
        (signal, input, config) => client.sendTransactions(input, { ...config, abortSignal: signal }),
        [client],
    );
}
