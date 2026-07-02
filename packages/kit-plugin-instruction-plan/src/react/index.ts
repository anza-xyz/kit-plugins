import type { ClientWithTransactionPlanning, ClientWithTransactionSending } from '@solana/kit';
import { type ActionResult, useAction, useClientCapability } from '@solana/react';

type SendTransaction = ClientWithTransactionSending['sendTransaction'];
type SendTransactionInput = Parameters<SendTransaction>[0];

/**
 * Plans and sends a single transaction from a React component.
 *
 * Wraps the client's `sendTransaction` function with {@link useAction}. Requires a
 * `ClientProvider` whose client has `sendTransaction` installed (via `planAndSendTransactions()`);
 * asserts this at mount with {@link useClientCapability}.
 *
 * `dispatch`/`dispatchAsync` take the instruction, transaction message, instruction plan or
 * transaction plan input. The hook owns the `AbortSignal`, so an in-flight call is aborted when a
 * newer one is dispatched.
 *
 * @example
 * ```tsx
 * const { dispatch, data, error, isRunning } = useSendTransaction();
 * dispatch(myInstructionPlan);
 * ```
 *
 * @see {@link useSendTransactions}
 */
export function useSendTransaction(): ActionResult<
    [input: SendTransactionInput],
    Awaited<ReturnType<SendTransaction>>
> {
    const client = useClientCapability<ClientWithTransactionSending>({
        capability: 'sendTransaction',
        hookName: 'useSendTransaction',
        providerHint: 'Install `planAndSendTransactions()` on the client.',
    });
    return useAction((abortSignal, input: SendTransactionInput) => client.sendTransaction(input, { abortSignal }));
}

type PlanTransaction = ClientWithTransactionPlanning['planTransaction'];
type PlanTransactionInput = Parameters<PlanTransaction>[0];

type PlanTransactions = ClientWithTransactionPlanning['planTransactions'];
type PlanTransactionsInput = Parameters<PlanTransactions>[0];

/**
 * Plans a single transaction message from a React component, without sending it.
 *
 * Wraps the client's `planTransaction` function with {@link useAction}. Requires a
 * `ClientProvider` whose client has `planTransaction` installed (via `planAndSendTransactions()`);
 * asserts this at mount with {@link useClientCapability}. The hook owns the `AbortSignal`, so an
 * in-flight call is aborted when a newer one is dispatched.
 *
 * @example
 * ```tsx
 * const { dispatch, data } = usePlanTransaction();
 * dispatch(myInstructionPlan);
 * ```
 *
 * @see {@link usePlanTransactions}
 */
export function usePlanTransaction(): ActionResult<
    [input: PlanTransactionInput],
    Awaited<ReturnType<PlanTransaction>>
> {
    const client = useClientCapability<ClientWithTransactionPlanning>({
        capability: 'planTransaction',
        hookName: 'usePlanTransaction',
        providerHint: 'Install `planAndSendTransactions()` on the client.',
    });
    return useAction((abortSignal, input: PlanTransactionInput) => client.planTransaction(input, { abortSignal }));
}

/**
 * Plans a transaction plan (one or more transactions) from a React component, without sending it.
 *
 * Wraps the client's `planTransactions` function with {@link useAction}. Requires a
 * `ClientProvider` whose client has `planTransactions` installed (via `planAndSendTransactions()`);
 * asserts this at mount with {@link useClientCapability}. The hook owns the `AbortSignal`, so an
 * in-flight call is aborted when a newer one is dispatched.
 *
 * @example
 * ```tsx
 * const { dispatch, data } = usePlanTransactions();
 * dispatch(myInstructionPlan);
 * ```
 *
 * @see {@link usePlanTransaction}
 */
export function usePlanTransactions(): ActionResult<
    [input: PlanTransactionsInput],
    Awaited<ReturnType<PlanTransactions>>
> {
    const client = useClientCapability<ClientWithTransactionPlanning>({
        capability: 'planTransactions',
        hookName: 'usePlanTransactions',
        providerHint: 'Install `planAndSendTransactions()` on the client.',
    });
    return useAction((abortSignal, input: PlanTransactionsInput) => client.planTransactions(input, { abortSignal }));
}

type SendTransactions = ClientWithTransactionSending['sendTransactions'];
type SendTransactionsInput = Parameters<SendTransactions>[0];

/**
 * Plans and sends a transaction plan (one or more transactions) from a React component.
 *
 * Wraps the client's `sendTransactions` function with {@link useAction}. Requires a
 * `ClientProvider` whose client has `sendTransactions` installed (via `planAndSendTransactions()`);
 * asserts this at mount with {@link useClientCapability}. Unlike {@link useSendTransaction}, the
 * result is the full transaction plan result rather than a single successful transaction. The hook
 * owns the `AbortSignal`, so an in-flight call is aborted when a newer one is dispatched.
 *
 * @example
 * ```tsx
 * const { dispatch, data } = useSendTransactions();
 * dispatch(myInstructionPlan);
 * ```
 *
 * @see {@link useSendTransaction}
 */
export function useSendTransactions(): ActionResult<
    [input: SendTransactionsInput],
    Awaited<ReturnType<SendTransactions>>
> {
    const client = useClientCapability<ClientWithTransactionSending>({
        capability: 'sendTransactions',
        hookName: 'useSendTransactions',
        providerHint: 'Install `planAndSendTransactions()` on the client.',
    });
    return useAction((abortSignal, input: SendTransactionsInput) => client.sendTransactions(input, { abortSignal }));
}
