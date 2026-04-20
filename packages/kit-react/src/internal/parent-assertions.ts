import type { Client, ClientWithPayer } from '@solana/kit';

import { useClient } from '../client-context';

/**
 * @internal
 * Reads the parent Kit client and asserts it has `client.payer`. Throws a
 * provider-specific error when the capability is missing.
 *
 * Providers that install transaction-sending plugins on top of a payer
 * (`RpcProvider`, `LiteSvmProvider`) call this first. Pulling the
 * `useClient` + throw pair into a named hook keeps the hook call sequence
 * stable in the caller: the hook always runs in the same position, and a
 * future refactor that swaps the throw for a conditional `return` will
 * make any downstream hook calls visibly conditional — flaggable by
 * `react-hooks/rules-of-hooks` rather than silently drifting the hook
 * count.
 */
export function useParentWithPayer(providerName: string, extraHint?: string): Client<ClientWithPayer> {
    const parent = useClient();
    if (!('payer' in parent)) {
        throw new Error(
            `${providerName} requires a payer. Wrap it in a WalletProvider ` +
                `(with role 'signer' or 'payer') or a PayerProvider.${extraHint ? ' ' + extraHint : ''}`,
        );
    }
    return parent as Client<ClientWithPayer>;
}
