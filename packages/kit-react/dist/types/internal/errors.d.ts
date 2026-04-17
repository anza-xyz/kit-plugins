/**
 * @internal
 * Throws a consistently-formatted error when a hook is used outside its
 * required provider. Use for simple "you need exactly this provider" cases
 * (e.g. `useClient` / `useChain` need `KitClientProvider`).
 */
export declare function throwMissingProvider(hookName: string, providerName: string): never;
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
export declare function throwMissingCapability(hookName: string, capability: string, providerHint: string): never;
//# sourceMappingURL=errors.d.ts.map