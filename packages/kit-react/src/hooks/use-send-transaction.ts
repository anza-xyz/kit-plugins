import type { ClientWithTransactionSending } from '@solana/kit';
import { useCallback } from 'react';

import { useSendingClient } from '../internal/sending-client';
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
 * Requires an ancestor provider that supplies `client.sendTransaction`
 * (e.g. {@link RpcProvider} or {@link LiteSvmProvider}).
 *
 * @throws If no ancestor RPC / LiteSVM provider is mounted.
 *
 * @example
 * ```tsx
 * const { send, status, data, error } = useSendTransaction();
 * await send(getTransferInstruction({ source, destination, amount }));
 * ```
 *
 * @see {@link useSendTransactions}
 * @see {@link useAction}
 */
export function useSendTransaction(): UseSendTransactionState {
    const client = useSendingClient('useSendTransaction');
    const fn = useCallback<SendTransactionFn>((input, config) => client.sendTransaction(input, config), [client]);
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
 * @throws If no ancestor RPC / LiteSVM provider is mounted.
 *
 * @see {@link useSendTransaction}
 */
export function useSendTransactions(): UseSendTransactionsState {
    const client = useSendingClient('useSendTransactions');
    const fn = useCallback<SendTransactionsFn>((input, config) => client.sendTransactions(input, config), [client]);
    return useAction(fn);
}
