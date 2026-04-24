import type { Client, ClientPlugin } from '@solana/kit';
import { type ReactNode, useMemo } from 'react';

import { ClientContext, useClient } from '../client-context';
import { useIdentityChurnWarning } from '../dev-warnings';

/**
 * A Kit plugin function accepted by {@link PluginProvider}. Deliberately
 * wider than `ClientPlugin<object, object>` so plugins that require
 * specific capabilities on their input (e.g. `ClientWithPayer`) type-check
 * at the call site — the runtime ordering of providers is what guarantees
 * the required capabilities are present.
 */
export type AnyPlugin = ClientPlugin<never, object>;

/**
 * Props for {@link PluginProvider}.
 */
export type PluginProviderProps = Readonly<{
    children?: ReactNode;
    /**
     * Ordered list of Kit plugins to install on top of the enclosing
     * client. Applied in order via `client.use(...)`. The array's
     * reference identity is used as the cache key, so memoize it if
     * you're building the list inline. A dev-only warning fires after
     * repeated identity changes to flag accidental inline allocations.
     */
    plugins: readonly AnyPlugin[];
}>;

/**
 * Generic provider that installs an ordered list of Kit plugins on top of
 * the enclosing client.
 *
 * Any Kit plugin works with `@solana/kit-react` through this provider;
 * plugin authors do not need to ship a React-specific wrapper. Each
 * plugin is applied synchronously via `client.use(plugin)`. Async plugins
 * are not supported here; use a purpose-built provider for those.
 *
 * @param props - The plugin list and subtree.
 * @return A React element that re-publishes the extended client.
 *
 * @example
 * ```tsx
 * const plugins = useMemo(() => [dasPlugin({ endpoint })], [endpoint]);
 * return <PluginProvider plugins={plugins}>{children}</PluginProvider>;
 * ```
 */
export function PluginProvider({ children, plugins }: PluginProviderProps) {
    const parent = useClient();
    useIdentityChurnWarning(plugins, {
        propName: 'plugins',
        providerName: 'PluginProvider',
    });
    const client = useMemo<Client<object>>(() => {
        let next: Client<object> = parent;
        for (const plugin of plugins) {
            // Kit's `.use()` is generic over the specific input/output shape
            // of a single plugin. An array of heterogeneous plugins can't be
            // threaded through that signature — the runtime ordering of
            // nested providers is what guarantees each plugin's input shape,
            // which TypeScript cannot see across the React tree. The cast
            // narrows `.use` to our loose `(p: AnyPlugin) => Client<object>`
            // contract so the iteration type-checks.
            //
            // TODO(async-plugins): `PluginProvider` is sync-only today.
            // Async plugins (whose `.use()` returns a `Promise<Client<T>>`)
            // will surface a promise-shaped client here, which fails loudly
            // at first consumption. Follow-up PR: walk the chain as
            // AsyncClient once any plugin in the list is async, and suspend
            // via React 19's `use(promise)` (with a React 18 fallback that
            // caches + throws the pending promise). Consumers with async
            // plugins will need a `<Suspense>` boundary above the provider;
            // sync-only chains stay zero-config. For now, the workaround
            // is to build the client outside React and pass it via
            // `<KitClientProvider client={...}>`.
            next = (next as unknown as { use: (p: AnyPlugin) => Client<object> }).use(plugin);
        }
        return next;
    }, [parent, plugins]);
    return <ClientContext.Provider value={client}>{children}</ClientContext.Provider>;
}
