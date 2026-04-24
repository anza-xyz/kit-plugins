import type { DependencyList } from 'react';

import { useLiveStore } from '../internal/live-store';
import { disabledActionStore, type RequestResult, useRequestResult } from '../internal/request-result';
import type { ReactiveActionStore } from '../kit-prereqs';

/**
 * Anything that produces a `ReactiveActionStore<[], T>` via `.reactiveStore()`.
 *
 * `PendingRpcRequest<T>` satisfies this by design; plugin-authored
 * pending objects that expose the same method plug in without
 * modification.
 *
 * @typeParam T - The value resolved by each dispatch.
 */
export type ReactiveActionSource<T> = {
    reactiveStore(): ReactiveActionStore<[], T>;
};

/**
 * Fires a one-shot request on mount and whenever `deps` change.
 *
 * Returns reactive state tracking the call's lifecycle. Stale-while-
 * revalidate: during a re-dispatch after a prior success, `data` still
 * holds the old value and `status` reports `'retrying'`. Return `null`
 * from `factory` to disable: no request fires, and `status` reports
 * `'disabled'`.
 *
 * @typeParam T - The value resolved by the request.
 * @param factory - Factory returning a {@link ReactiveActionSource}, or
 *                  `null` to disable. Runs when `deps` change.
 * @param deps - Dependency list matching React's hook-dep conventions.
 * @return A {@link RequestResult} carrying `data`, `error`, `status`,
 *         `isLoading`, and a stable `refresh` function.
 *
 * @example
 * ```tsx
 * const { data: epoch, refresh } = useRequest(
 *     () => client.rpc.getEpochInfo(),
 *     [client],
 * );
 * ```
 *
 * @see {@link useLiveData}
 * @see {@link useAction}
 */
export function useRequest<T>(
    factory: (signal: AbortSignal) => ReactiveActionSource<T> | null,
    deps: DependencyList,
): RequestResult<T> {
    const store = useLiveStore<ReactiveActionStore<[], T>>(
        signal => {
            const pending = factory(signal);
            if (pending === null) return disabledActionStore<T>();
            return pending.reactiveStore();
        },
        () => disabledActionStore<T>(),
        deps,
    );
    return useRequestResult(store);
}
