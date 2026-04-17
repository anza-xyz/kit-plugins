import type { ClientWithTransactionPlanning, ClientWithTransactionSending } from '@solana/kit';

import { useClientCapability } from '../client-capability';

/**
 * @internal
 * Per-capability client helpers. Kit plugins are intentionally granular —
 * one plugin can install just `planTransaction`, another just
 * `sendTransactions`, etc. — so each React hook checks only the single
 * capability it actually calls. That keeps error messages aimed at the
 * specific missing method and avoids asserting the hook needs more than
 * it does.
 */

const SENDING_HINT =
    'Usually supplied by <RpcProvider> or <LiteSvmProvider> — or any provider that installs the transaction-sending plugin.';
const PLANNING_HINT =
    'Usually supplied by <RpcProvider> or <LiteSvmProvider> — or any provider that installs the transaction-planning plugin.';

/** @internal Client asserted to have `sendTransaction`. */
export function useClientWithSendTransaction(hookName: string): Pick<ClientWithTransactionSending, 'sendTransaction'> {
    return useClientCapability<Pick<ClientWithTransactionSending, 'sendTransaction'>>({
        capability: 'sendTransaction',
        hookName,
        providerHint: SENDING_HINT,
    });
}

/** @internal Client asserted to have `sendTransactions`. */
export function useClientWithSendTransactions(
    hookName: string,
): Pick<ClientWithTransactionSending, 'sendTransactions'> {
    return useClientCapability<Pick<ClientWithTransactionSending, 'sendTransactions'>>({
        capability: 'sendTransactions',
        hookName,
        providerHint: SENDING_HINT,
    });
}

/** @internal Client asserted to have `planTransaction`. */
export function useClientWithPlanTransaction(hookName: string): Pick<ClientWithTransactionPlanning, 'planTransaction'> {
    return useClientCapability<Pick<ClientWithTransactionPlanning, 'planTransaction'>>({
        capability: 'planTransaction',
        hookName,
        providerHint: PLANNING_HINT,
    });
}

/** @internal Client asserted to have `planTransactions`. */
export function useClientWithPlanTransactions(
    hookName: string,
): Pick<ClientWithTransactionPlanning, 'planTransactions'> {
    return useClientCapability<Pick<ClientWithTransactionPlanning, 'planTransactions'>>({
        capability: 'planTransactions',
        hookName,
        providerHint: PLANNING_HINT,
    });
}
