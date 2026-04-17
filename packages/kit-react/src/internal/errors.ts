/**
 * @internal
 * Throws a consistently-formatted error when a hook is used outside its
 * required provider. Use for simple "you need exactly this provider" cases
 * (e.g. `useClient` / `useChain` need `KitClientProvider`).
 */
export function throwMissingProvider(hookName: string, providerName: string): never {
    throw new Error(
        `${hookName}() must be used within <${providerName}>. ` +
            `Wrap your component tree in <${providerName}> (or an ancestor provider that includes it).`,
    );
}

/**
 * @internal
 * Throws when a hook needs a client capability (a set of properties / methods
 * on the Kit client) that no ancestor provider has installed.
 *
 * Unlike {@link throwMissingProvider}, this is for cases where multiple
 * providers can satisfy the requirement (e.g. `client.rpc` is installed by
 * `RpcProvider`, `LiteSvmProvider`, or a custom `PluginProvider` stack). The
 * message leads with the missing capability so power users with custom stacks
 * understand what's needed, then lists the common providers as concrete fixes.
 */
export function throwMissingCapability(hookName: string, capability: string, providerHint: string): never {
    throw new Error(`${hookName}() requires ${capability}. ${providerHint}`);
}
