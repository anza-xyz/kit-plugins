import type { Client } from '@solana/kit';

import { useClient } from './client-context';
import { throwMissingCapability } from './internal/errors';

/** Options accepted by {@link useClientCapability}. */
export type UseClientCapabilityOptions = {
    /**
     * A single capability key, or an ordered list of keys. Each entry is
     * checked against the current client via `key in client`, and is also
     * included in the error message (rendered as `` `client.<key>` ``) so
     * the developer immediately sees what's missing.
     */
    readonly capability: string | readonly string[];
    /**
     * The name of the calling hook. Used as the subject of the error —
     * `useFoo() requires …`. Pass the hook's public name so stack traces
     * and messages line up.
     */
    readonly hookName: string;
    /**
     * Free-text hint appended to the error message explaining how to
     * install the capability — typically "Usually supplied by `<FooProvider>`."
     */
    readonly providerHint: string;
};

/**
 * Reads the current Kit client and asserts it advertises the given
 * capability / capabilities. Throws a consistently-formatted error when
 * the required keys are not present.
 *
 * This is the public, third-party-friendly version of the internal
 * `useRpcClient` / `useSendingClient` / `useWalletClient` helpers — any
 * plugin author can use it to build typed, safety-checked hooks over
 * their plugin's client extension without reinventing the error format.
 *
 * The TypeScript narrowing is a caller-declared cast (same pattern as
 * {@link useClient}'s generic) — the runtime check guarantees the named
 * keys exist, not that they have any particular shape. Keep `TClient`
 * aligned with what the capability actually installs.
 *
 * @typeParam TClient - The shape the client takes after the capability is
 *   installed. This is the return type of the hook.
 * @throws If no ancestor {@link KitClientProvider} is mounted, or if the
 *   client does not advertise the requested capability.
 *
 * @example Single capability
 * ```ts
 * import type { DasClient } from '@my-org/kit-plugin-das';
 *
 * export function useAsset(address: Address) {
 *     const client = useClientCapability<DasClient>({
 *         capability: 'das',
 *         hookName: 'useAsset',
 *         providerHint: 'Usually supplied by <DasProvider>.',
 *     });
 *     return useSWR(['das-asset', address], () => client.das.getAsset(address).send());
 * }
 * ```
 *
 * @example Multiple capabilities
 * ```ts
 * const client = useClientCapability<SolanaRpcClient>({
 *     capability: ['rpc', 'rpcSubscriptions'],
 *     hookName: 'useBalance',
 *     providerHint: 'Usually supplied by <RpcProvider> or <LiteSvmProvider>.',
 * });
 * ```
 */
export function useClientCapability<TClient extends object>({
    capability,
    hookName,
    providerHint,
}: UseClientCapabilityOptions): Client<TClient> {
    const client = useClient();
    const keys = typeof capability === 'string' ? [capability] : capability;
    for (const key of keys) {
        if (!(key in client)) {
            throwMissingCapability(hookName, formatCapabilityLabel(keys), providerHint);
        }
    }
    return client as unknown as Client<TClient>;
}

/**
 * @internal
 * Renders a list of capability keys as a user-friendly error-message
 * fragment, e.g. `` `client.rpc` and `client.rpcSubscriptions` ``.
 */
function formatCapabilityLabel(keys: readonly string[]): string {
    const labels = keys.map(k => `\`client.${k}\``);
    if (labels.length === 1) return labels[0];
    if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
    return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
}
