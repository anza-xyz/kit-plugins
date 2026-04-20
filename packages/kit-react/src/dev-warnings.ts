import { useEffect, useRef } from 'react';

/**
 * @internal
 * Number of consecutive renders a prop must churn before the warning fires.
 *
 * Threshold is intentionally greater than 1 so a single render of legitimate
 * prop-identity change (e.g. the caller wired up a new `filter` on a
 * deliberate state transition) doesn't trigger a false positive. Sustained
 * churn across multiple renders — the common result of inline arrow functions
 * or inline object literals — trips the warning once, then stays quiet.
 */
const CHURN_WARNING_THRESHOLD = 2;

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
 * **Scoped to providers.** This pattern is intentionally reserved for
 * provider components where a rebuild has a catastrophic consequence
 * (tearing down WebSocket subscriptions, wallet discovery, the active
 * connection) and the symptom doesn't look anything like the cause. For
 * hook arguments, rely on `react-hooks/exhaustive-deps` at the caller's
 * site — it flags unstable references in the caller's deps list, which is
 * the idiomatic React feedback loop. Runtime churn warnings elsewhere in
 * the ecosystem are rare, so we keep the unusual pattern where the severity
 * actually justifies it.
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
export function useIdentityChurnWarning({ consequence, providerName, props }: UseIdentityChurnWarningOptions): void {
    // Always call the same number of hooks per render regardless of build mode.
    // The effect body is gated on NODE_ENV so the dev-only work is trivially
    // dropped in production.
    const previousPropsRef = useRef<Readonly<Record<string, unknown>> | null>(null);
    const churnCountRef = useRef(0);
    const warnedRef = useRef(false);

    useEffect(() => {
        if (process.env.NODE_ENV === 'production') return;
        const previous = previousPropsRef.current;
        previousPropsRef.current = props;
        // First render has nothing to compare against — just prime the ref.
        if (previous === null) return;

        const changed = diffIdentity(previous, props);
        if (changed.length === 0) {
            churnCountRef.current = 0;
            return;
        }

        churnCountRef.current++;
        if (churnCountRef.current >= CHURN_WARNING_THRESHOLD && !warnedRef.current) {
            warnedRef.current = true;
            const label = changed.map(p => `\`${p}\``).join(', ');
            const subject = changed.length === 1 ? `prop identity for ${label} is` : `prop identities for ${label} are`;
            console.warn(
                `${providerName}: ${subject} changing across renders. ` +
                    'Wrap in useMemo or hoist to module scope — otherwise ' +
                    consequence,
            );
        }
    });
}

/**
 * @internal
 * Returns the names of keys whose values changed identity between `prev` and
 * `next`. Arrays are compared element-wise so a new-array-same-elements
 * literal (e.g. `plugins={[a, b]}` inline) doesn't count as churn as long as
 * the elements themselves are stable.
 */
function diffIdentity(prev: Readonly<Record<string, unknown>>, next: Readonly<Record<string, unknown>>): string[] {
    const changed: string[] = [];
    for (const key of Object.keys(next)) {
        if (!valueIsIdentical(prev[key], next[key])) {
            changed.push(key);
        }
    }
    return changed;
}

/** @internal */
function valueIsIdentical(prev: unknown, next: unknown): boolean {
    if (Array.isArray(prev) && Array.isArray(next)) {
        if (prev.length !== next.length) return false;
        for (let i = 0; i < prev.length; i++) {
            if (!Object.is(prev[i], next[i])) return false;
        }
        return true;
    }
    return Object.is(prev, next);
}
