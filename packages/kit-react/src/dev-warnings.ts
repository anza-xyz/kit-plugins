import { useEffect, useRef } from 'react';

/**
 * Options for {@link useIdentityChurnWarning}.
 */
export type UseIdentityChurnWarningOptions = Readonly<{
    /** Short name of the prop being watched (e.g. `"plugins"`). */
    propName: string;
    /** Name of the provider (e.g. `"PluginProvider"`). */
    providerName: string;
    /** Free-text remedy shown after the churn warning. */
    remedy?: string;
}>;

/**
 * Dev-only warning that fires when a prop's reference identity changes on
 * every render without the value meaningfully differing.
 *
 * Providers that rebuild a client chain on identity-change use this to
 * flag accidental inline-object props that would churn the entire
 * subtree. Silent in production builds.
 *
 * @typeParam T - The value type being watched.
 * @param value - The prop value to observe across renders.
 * @param options - Configuration for the warning message.
 *
 * @example
 * ```tsx
 * function MyProvider({ plugins, children }: MyProviderProps) {
 *     useIdentityChurnWarning(plugins, {
 *         propName: 'plugins',
 *         providerName: 'MyProvider',
 *     });
 *     // ...
 * }
 * ```
 */
export function useIdentityChurnWarning<T>(
    value: T,
    { propName, providerName, remedy }: UseIdentityChurnWarningOptions,
): void {
    const previousRef = useRef<T>(value);
    const changeCountRef = useRef(0);
    useEffect(() => {
        if (process.env.NODE_ENV === 'production') return;
        if (previousRef.current !== value) {
            previousRef.current = value;
            changeCountRef.current += 1;
            if (changeCountRef.current >= 3) {
                const base = `<${providerName}>: the \`${propName}\` prop has changed identity ${changeCountRef.current} times.`;
                const hint =
                    remedy ??
                    `Wrap the value in \`useMemo\` so the provider only rebuilds when it meaningfully changes.`;
                console.warn(`${base} ${hint}`);
            }
        }
    }, [value, propName, providerName, remedy]);
}
