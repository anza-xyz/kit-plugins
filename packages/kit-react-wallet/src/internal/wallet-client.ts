import type { ClientWithWallet } from '@solana/kit-plugin-wallet';
import { useClientCapability } from '@solana/kit-react';

/**
 * @internal
 * Returns the client and asserts that it has a `wallet` namespace attached.
 */
export function useWalletClient(hookName: string): ClientWithWallet {
    return useClientCapability<ClientWithWallet>({
        capability: 'wallet',
        hookName,
        providerHint: 'Usually supplied by <WalletProvider> — or any provider that installs a wallet plugin.',
    });
}
