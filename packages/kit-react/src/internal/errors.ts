/**
 * @internal
 * Throws a consistently-formatted error when a hook is used outside its
 * required provider.
 */
export function throwMissingProvider(hookName: string, providerName: string): never {
    throw new Error(
        `${hookName}() must be used within <${providerName}>. ` +
            `Wrap your component tree in <${providerName}> (or an ancestor provider that includes it).`,
    );
}
