import type { Client, ClientPlugin } from '@solana/kit';
import { type ReactNode, useMemo } from 'react';

import { ClientContext, useClient } from '../client-context';
import { useIdentityChurnWarning } from '../dev-warnings';

type AnyPlugin = ClientPlugin<object, object>;

/** Props for {@link PluginProvider}. */
export type PluginProviderProps = {
    children?: ReactNode;
    /**
     * Ordered list of Kit plugins to apply. For the one-plugin case, pass a
     * single-element array (`[plugin]`). Each plugin's identity should be
     * stable across renders — memoize if the construction has runtime inputs.
     * A dev-mode warning fires if identity churns.
     */
    plugins: readonly AnyPlugin[];
};

/**
 * Generic provider that installs an ordered list of Kit plugins into the
 * client context without needing a plugin-specific React wrapper.
 *
 * This enables any framework-agnostic Kit plugin to be used in a React tree:
 * plugin authors don't need to ship a React provider alongside their plugin —
 * consumers just drop the plugin(s) into `PluginProvider`.
 *
 * Plugin identities should be stable across renders (memoize them in the
 * calling component); otherwise a fresh client is rebuilt on every render.
 *
 * @example Single plugin
 * ```tsx
 * <PluginProvider plugins={[dasPlugin({ endpoint: '...' })]}>
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
export function PluginProvider({ children, plugins }: PluginProviderProps) {
    const parent = useClient();
    const extended = useMemo(
        () => plugins.reduce<Client<object>>((acc, p) => acc.use(p as ClientPlugin<object, object>), parent),
        // We intentionally depend on `parent` and each plugin identity.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [parent, ...plugins],
    );

    // Dev-only: warn when the plugin reference(s) churn across renders, which
    // almost always means the caller forgot to memoize. Each churn rebuilds
    // the client from scratch, losing any subscriptions or cached state
    // installed by downstream plugins. Arrays are element-wise compared so
    // `plugins={[a, b]}` inline doesn't register as churn as long as the
    // elements themselves are stable.
    useIdentityChurnWarning({
        consequence: 'a fresh client is rebuilt on every render, dropping subscriptions and cached state.',
        props: { plugins },
        providerName: '<PluginProvider>',
    });

    return <ClientContext.Provider value={extended}>{children}</ClientContext.Provider>;
}
