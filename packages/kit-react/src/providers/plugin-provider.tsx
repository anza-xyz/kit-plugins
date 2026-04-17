import type { Client, ClientPlugin } from '@solana/kit';
import { type ReactNode, useEffect, useMemo, useRef } from 'react';

import { ClientContext, useClient } from '../client-context';

type AnyPlugin = ClientPlugin<object, object>;

/** @internal Threshold for the dev-only churn warning. */
const CHURN_WARNING_THRESHOLD = 2;

/** Props for {@link PluginProvider} — accepts a single plugin or an array. */
export type PluginProviderProps =
    | {
          children?: ReactNode;
          /** A single Kit plugin to apply. */
          plugin: AnyPlugin;
          plugins?: never;
      }
    | {
          children?: ReactNode;
          plugin?: never;
          /** An ordered list of Kit plugins to apply. */
          plugins: readonly AnyPlugin[];
      };

/**
 * Generic provider that installs any Kit plugin (or ordered list of plugins)
 * into the client context without needing a plugin-specific React wrapper.
 *
 * This enables any framework-agnostic Kit plugin to be used in a React tree:
 * plugin authors don't need to ship a React provider alongside their plugin —
 * consumers just drop the plugin into `PluginProvider`.
 *
 * Plugin references should be stable across renders (memoize them in the
 * calling component); otherwise a fresh client is created each render.
 *
 * @example Single plugin
 * ```tsx
 * <PluginProvider plugin={dasPlugin({ endpoint: '...' })}>
 *     <App />
 * </PluginProvider>
 * ```
 *
 * @example Multiple plugins
 * ```tsx
 * <PluginProvider plugins={[dasPlugin({ endpoint: '...' }), tokenPlugin(), memoPlugin()]}>
 *     <App />
 * </PluginProvider>
 * ```
 */
export function PluginProvider({ children, plugin, plugins }: PluginProviderProps) {
    const parent = useClient();
    const list = plugin ? [plugin] : plugins;
    const extended = useMemo(
        () => list.reduce<Client<object>>((acc, p) => acc.use(p as ClientPlugin<object, object>), parent),
        // We intentionally depend on `parent` and each plugin identity.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [parent, ...list],
    );

    // Dev-only: warn when the plugin reference churns across renders, which
    // almost always means the caller forgot to memoize. Each churn rebuilds
    // the client from scratch, losing any subscriptions or cached state
    // installed by downstream plugins. Legitimate changes (e.g. a dynamic
    // plugin via `useMemo` with changing deps) register as a single identity
    // change before stabilising, so they don't reach the warning threshold.
    const previousListRef = useRef<readonly AnyPlugin[] | null>(null);
    const churnCountRef = useRef(0);
    const warnedRef = useRef(false);
    useEffect(() => {
        if (process.env.NODE_ENV === 'production') return;
        const previous = previousListRef.current;
        previousListRef.current = list;
        if (previous === null) return;
        if (sameIdentities(previous, list)) {
            churnCountRef.current = 0;
            return;
        }
        churnCountRef.current++;
        if (churnCountRef.current >= CHURN_WARNING_THRESHOLD && !warnedRef.current) {
            warnedRef.current = true;
            console.warn(
                '<PluginProvider>: plugin identity is changing across renders. ' +
                    'Wrap the plugin prop in `useMemo` or hoist it to module scope — ' +
                    'otherwise a fresh client is rebuilt on every render, dropping subscriptions and cached state.',
            );
        }
    });

    return <ClientContext.Provider value={extended}>{children}</ClientContext.Provider>;
}

/** @internal */
function sameIdentities(a: readonly AnyPlugin[], b: readonly AnyPlugin[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}
