import type { ClientWithRpc, ClientWithRpcSubscriptions, SolanaRpcApi, SolanaRpcSubscriptionsApi } from '@solana/kit';

import { useClientCapability } from '../client-capability';

/** @internal The subset of client capabilities needed by live-data hooks. */
export type SolanaRpcClient = ClientWithRpc<SolanaRpcApi> & ClientWithRpcSubscriptions<SolanaRpcSubscriptionsApi>;

/**
 * @internal
 * Returns the client and asserts that it has both `rpc` and `rpcSubscriptions`.
 */
export function useRpcClient(hookName: string): SolanaRpcClient {
    return useClientCapability<SolanaRpcClient>({
        capability: ['rpc', 'rpcSubscriptions'],
        hookName,
        providerHint:
            'Usually supplied by <RpcProvider> (remote RPC) or <LiteSvmProvider> (local/test) — or any provider that installs the RPC + subscriptions plugins.',
    });
}
