/** Options accepted by {@link useIdentityChurnWarning}. */
export type UseIdentityChurnWarningOptions = {
    /**
     * Short, user-facing description of what churn actually does. Appended
     * to the warning after the fix suggestion. For example:
     * `"the wallet plugin is rebuilt, tearing down discovery and the active
     * connection."`
     */
    readonly consequence: string;
    /**
     * Map of prop names to their current values. Each entry's identity is
     * compared to the previous render via {@link Object.is} (arrays are
     * compared element-wise, so `plugins={[a, b]}` inline with stable `a`
     * and `b` doesn't register as churn).
     */
    readonly props: Readonly<Record<string, unknown>>;
    /**
     * Provider name as it appears to the user, including angle brackets — e.g.
     * `"<WalletProvider>"`. Used as the subject of the warning.
     */
    readonly providerName: string;
};
/**
 * Dev-mode hook that warns when one or more tracked props churn identity
 * across consecutive renders — the canonical signal that the caller forgot
 * to memoize an inline value.
 *
 * All providers in this package use it to surface the same class of footgun
 * with a consistent error format. Third-party plugin authors shipping custom
 * providers can use it the same way, so the "I wrote an inline object and
 * lost my subscriptions" experience is identical across the ecosystem.
 *
 * The hook is a no-op in production builds (gated on
 * `process.env.NODE_ENV !== 'production'`), so there's no runtime cost to
 * shipping it in production code.
 *
 * @example
 * ```tsx
 * useIdentityChurnWarning({
 *     providerName: '<MyProvider>',
 *     consequence: 'the custom client plugin is rebuilt every render.',
 *     props: { config, options },
 * });
 * ```
 */
export declare function useIdentityChurnWarning({ consequence, providerName, props }: UseIdentityChurnWarningOptions): void;
//# sourceMappingURL=dev-warnings.d.ts.map