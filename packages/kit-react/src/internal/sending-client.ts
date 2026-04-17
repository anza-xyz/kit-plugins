import type { ClientWithTransactionSending } from '@solana/kit';

import { useClient } from '../client-context';
import { throwMissingProvider } from './errors';

/**
 * @internal
 * Returns the client and asserts it has `sendTransaction` / `sendTransactions`.
 */
export function useSendingClient(hookName: string): ClientWithTransactionSending {
    const client = useClient();
    if (!('sendTransaction' in client) || !('sendTransactions' in client)) {
        throwMissingProvider(hookName, 'RpcProvider');
    }
    return client as unknown as ClientWithTransactionSending;
}
