import type { Client } from '@solana/kit';

import { useClient } from './client-context';
import { throwMissingCapability } from './errors';

/**
 * Options for {@link useClientCapability}.
 */
export type UseClientCapabilityOptions = Readonly<{
    /**
     * The capability name, or an ordered list of capability names, that
     * must be present on the client. Each is checked via `key in client`.
     */
    capability: string | readonly string[];
    /** Hook name shown as the subject of the error. */
    hookName: string;
    /** Free-text "how to fix" hint appended to the error. */
    providerHint: string;
}>;

/**
 * Reads the Kit client from context and asserts that the listed capability
 * (or capabilities) are installed.
 *
 * The TypeScript narrowing is caller-declared: the hook does not infer
 * `TClient` from the capability names. Mismatched casts are caller errors,
 * same as with {@link useClient}. Hook authors who want a loud
 * missing-provider failure at mount should prefer this over
 * `useClient<T>()`.
 *
 * @typeParam TClient - The client shape the caller expects after narrowing.
 * @param options - The capability name(s), hook name, and provider hint.
 * @return The Kit client cast to `Client<TClient>`.
 * @throws An `Error` describing the missing capability when any listed key
 *         is not present on the client.
 *
 * @example
 * ```ts
 * import type { ClientWithRpc, GetEpochInfoApi } from '@solana/kit';
 *
 * function useEpochInfo() {
 *     const client = useClientCapability<ClientWithRpc<GetEpochInfoApi>>({
 *         capability: 'rpc',
 *         hookName: 'useEpochInfo',
 *         providerHint: 'Install `solanaRpc()` or `solanaRpcConnection()` on the client.',
 *     });
 *     return useRequest(() => client.rpc.getEpochInfo(), [client]);
 * }
 * ```
 *
 * @see {@link useClient}
 */
export function useClientCapability<TClient extends object>(options: UseClientCapabilityOptions): Client<TClient> {
    const client = useClient<TClient>();
    const keys: readonly string[] = Array.isArray(options.capability)
        ? options.capability
        : [options.capability as string];
    for (const key of keys) {
        if (!(key in (client as object))) {
            const formatKey = (k: string): string => '`client.' + k + '`';
            const description: string =
                keys.length === 1 ? formatKey(key) : 'all of ' + keys.map((k: string) => formatKey(k)).join(', ');
            throwMissingCapability(options.hookName, description, options.providerHint);
        }
    }
    return client;
}
