/**
 * Throws a consistently-formatted error describing a missing client
 * capability.
 *
 * Used by {@link useClientCapability} and the hook-local assertions in
 * {@link usePayer}, {@link useIdentity}, etc.
 *
 * @param hookName - Name of the hook raising the error, used as the subject.
 * @param capabilityDescription - Human-readable description of the missing capability.
 * @param providerHint - Free-text "how to fix" hint appended to the error.
 * @throws Always throws an `Error` with the formatted message.
 *
 * @internal
 */
export function throwMissingCapability(hookName: string, capabilityDescription: string, providerHint: string): never {
    throw new Error(`${hookName}() requires ${capabilityDescription} on the Kit client. ${providerHint}`);
}
