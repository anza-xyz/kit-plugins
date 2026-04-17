import type { ClientWithWallet } from '@solana/kit-plugin-wallet';

import { useClient } from '../client-context';
import { throwMissingProvider } from './errors';

/**
 * @internal
 * Returns the client and asserts that it has a `wallet` namespace attached.
 */
export function useWalletClient(hookName: string): ClientWithWallet {
    const client = useClient();
    if (!('wallet' in client)) {
        throwMissingProvider(hookName, 'WalletProvider');
    }
    return client as ClientWithWallet;
}
