import type { Client } from '@solana/kit';

import { useClient } from '../../client-context';

/**
 * @internal
 * Reads the parent Kit client and asserts it does **not** already have a
 * `wallet` plugin installed. Throws when one is detected.
 *
 * Encapsulates the `useClient` + throw pair used by `<WalletProvider>` to
 * refuse double-installs. Extracting this into a named hook keeps the hook
 * call sequence stable in the caller — subsequent hooks (`useChain`,
 * `useIdentityChurnWarning`, `useMemo`) always run in the same position,
 * and any future refactor that swaps the throw for a conditional return
 * will make downstream hook calls visibly conditional (flaggable by
 * `react-hooks/rules-of-hooks`) rather than silently drifting the count.
 */
export function useParentWithoutWallet(): Client<object> {
    const parent = useClient();
    if ('wallet' in parent) {
        throw new Error(
            '<WalletProvider>: a wallet plugin is already installed on this client ' +
                '(detected `client.wallet`). Mounting a second WalletProvider — or a ' +
                'WalletProvider under a PluginProvider that already installs a wallet ' +
                'plugin — installs it twice and produces inconsistent state. Remove ' +
                'the inner <WalletProvider>, or build the KitClientProvider `client` ' +
                'without the baked-in wallet plugin.',
        );
    }
    return parent;
}
