import type { ClientWithRpc, ClientWithRpcSubscriptions, SolanaRpcApi, SolanaRpcSubscriptionsApi } from '@solana/kit';

import { useClient } from '../client-context';
import { throwMissingProvider } from './errors';

/** @internal The subset of client capabilities needed by live-data hooks. */
export type SolanaRpcClient = ClientWithRpc<SolanaRpcApi> & ClientWithRpcSubscriptions<SolanaRpcSubscriptionsApi>;

/**
 * @internal
 * Returns the client and asserts that it has both `rpc` and `rpcSubscriptions`.
 */
export function useRpcClient(hookName: string): SolanaRpcClient {
    const client = useClient();
    if (!('rpc' in client) || !('rpcSubscriptions' in client)) {
        throwMissingProvider(hookName, 'RpcProvider');
    }
    return client as unknown as SolanaRpcClient;
}
