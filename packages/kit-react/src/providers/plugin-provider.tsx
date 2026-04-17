import type { Client, ClientPlugin } from '@solana/kit';
import { type ReactNode, useMemo } from 'react';

import { ClientContext, useClient } from '../client-context';

type AnyPlugin = ClientPlugin<object, object>;

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
    return <ClientContext.Provider value={extended}>{children}</ClientContext.Provider>;
}
