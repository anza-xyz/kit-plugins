import { useEffect, useRef } from 'react';

export type UseIdentityChurnWarningOptions = Readonly<{
    /** Short name of the argument being watched (e.g. `"decoder"`). */
    argName: string;
    /** Name of the surrounding hook (e.g. `"useAccount"`). */
    hookName: string;
    /** Free-text remedy shown after the churn warning. */
    remedy?: string;
}>;

/**
 * Dev-only warning that fires when a value's reference identity changes on
 * every render. Used to surface accidental inline allocations in hook
 * arguments (e.g. an inline `getMintDecoder()` call passed to
 * `useAccount`) that would force the underlying reactive store to rebuild
 * each render. Silent in production builds.
 *
 * @internal
 */
export function useIdentityChurnWarning<T>(
    value: T,
    { argName, hookName, remedy }: UseIdentityChurnWarningOptions,
): void {
    const previousRef = useRef<T>(value);
    const changeCountRef = useRef(0);
    useEffect(() => {
        if (process.env.NODE_ENV === 'production') return;
        if (previousRef.current !== value) {
            previousRef.current = value;
            changeCountRef.current += 1;
            if (changeCountRef.current >= 3) {
                const base = `${hookName}: the \`${argName}\` argument has changed identity ${changeCountRef.current} times.`;
                const hint =
                    remedy ??
                    `Wrap the value in \`useMemo\` (or hoist to module scope) so the hook only rebuilds when it meaningfully changes.`;
                console.warn(`${base} ${hint}`);
            }
        }
    }, [value, argName, hookName, remedy]);
}
