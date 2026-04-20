import type { ClientWithTransactionSending } from '@solana/kit';
import { useCallback } from 'react';

import { useClientWithSendTransaction, useClientWithSendTransactions } from '../internal/sending-client';
import { type ActionState, useAction } from './use-action';

type SendTransactionFn = ClientWithTransactionSending['sendTransaction'];
type SendTransactionsFn = ClientWithTransactionSending['sendTransactions'];

/** Reactive state returned by {@link useSendTransaction}. */
export type UseSendTransactionState = ActionState<
    Parameters<SendTransactionFn>,
    Awaited<ReturnType<SendTransactionFn>>
>;

/** Reactive state returned by {@link useSendTransactions}. */
export type UseSendTransactionsState = ActionState<
    Parameters<SendTransactionsFn>,
    Awaited<ReturnType<SendTransactionsFn>>
>;

/**
 * Send a single transaction, tracking the plan → sign → send → confirm
 * lifecycle with reactive status / data / error state.
 *
 * The returned `send` accepts the same inputs as `client.sendTransaction`:
 * a raw instruction, an instruction plan, a transaction message, or a
 * pre-built single-transaction plan. Asserts at runtime that the resulting
 * plan contains exactly one successful transaction.
 *
 * Calling `send` again while a previous transaction is in flight aborts the
 * prior call — the hook-managed `AbortSignal` is threaded into
 * `client.sendTransaction`'s config so the underlying RPC request is
 * cancelled, not just the outer await. `reset()` has the same effect. Callers
 * that `await send(...)` should filter `AbortError` so a supersede doesn't
 * surface as a user-visible error (see {@link useAction} for full abort
 * semantics).
 *
 * Requires an ancestor provider that installs `client.sendTransaction`
 * (e.g. {@link RpcProvider} or {@link LiteSvmProvider}).
 *
 * @throws If no ancestor provider installs `client.sendTransaction`.
 *
 * @example
 * ```tsx
 * const { send, status, data, error } = useSendTransaction();
 *
 * async function onClick() {
 *     try {
 *         const result = await send(getTransferInstruction({ source, destination, amount }));
 *         navigate(`/tx/${result.signature}`);
 *     } catch (err) {
 *         // Superseded by another send() or a reset() — the hook's reactive
 *         // state already reflects the new action; don't show a stale error.
 *         if ((err as Error).name === 'AbortError') return;
 *         toast.error(String(err));
 *     }
 * }
 * ```
 *
 * @see {@link useSendTransactions}
 * @see {@link usePlanTransaction} — pairs with `useSendTransaction` for
 *   preview-then-send UX.
 * @see {@link useAction}
 */
export function useSendTransaction(): UseSendTransactionState {
    const client = useClientWithSendTransaction('useSendTransaction');
    const fn = useCallback(
        (
            signal: AbortSignal,
            input: Parameters<SendTransactionFn>[0],
            config?: Parameters<SendTransactionFn>[1],
        ): ReturnType<SendTransactionFn> => client.sendTransaction(input, { ...config, abortSignal: signal }),
        [client],
    );
    return useAction(fn);
}

/**
 * Send one or more transactions, tracking the lifecycle with reactive state.
 *
 * Accepts the same inputs as `client.sendTransactions`: a single instruction,
 * an instruction plan, or a pre-built multi-transaction plan. Returns the
 * full `TransactionPlanResult` (including any failures) rather than asserting
 * success.
 *
 * The hook-managed `AbortSignal` is threaded into
 * `client.sendTransactions`'s config, so calling `send` again while the
 * prior batch is in flight cancels the underlying work. `reset()` has the
 * same effect. Callers that `await send(...)` should filter `AbortError` —
 * see {@link useSendTransaction}'s example for the idiomatic shape, and
 * {@link useAction} for full abort semantics.
 *
 * @throws If no ancestor provider installs `client.sendTransactions`.
 *
 * @see {@link useSendTransaction}
 * @see {@link usePlanTransactions}
 */
export function useSendTransactions(): UseSendTransactionsState {
    const client = useClientWithSendTransactions('useSendTransactions');
    const fn = useCallback(
        (
            signal: AbortSignal,
            input: Parameters<SendTransactionsFn>[0],
            config?: Parameters<SendTransactionsFn>[1],
        ): ReturnType<SendTransactionsFn> => client.sendTransactions(input, { ...config, abortSignal: signal }),
        [client],
    );
    return useAction(fn);
}
