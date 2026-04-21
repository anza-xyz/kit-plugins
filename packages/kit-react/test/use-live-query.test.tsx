import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ClientContext, useLiveQuery } from '../src';
import { createClientWithRpc, createDeferred, rpcResponse, stubRpcRequest, stubRpcSubscription } from './_setup-rpc';

function wrap(client: object): (props: { children: ReactNode }) => ReactNode {
    return ({ children }) => <ClientContext.Provider value={client as never}>{children}</ClientContext.Provider>;
}

describe.skipIf(!__BROWSER__ && !__REACTNATIVE__)('useLiveQuery', () => {
    it('calls the factory and wires up the config', () => {
        const getAccountInfo = vi.fn(() => stubRpcRequest(() => new Promise(() => {})));
        const accountNotifications = vi.fn(() => stubRpcSubscription().request);
        const client = createClientWithRpc({
            rpc: { getAccountInfo },
            rpcSubscriptions: { accountNotifications },
        });
        const addr = 'FnHyam9w4NZoWR6mKN1CuGBritdsEWZQa4Z4oawLZGxa' as never;
        const factory = vi.fn(() => ({
            rpcRequest: client.rpc.getAccountInfo(addr, { encoding: 'base64' }),
            rpcSubscriptionRequest: client.rpcSubscriptions.accountNotifications(addr, { encoding: 'base64' }),
            rpcSubscriptionValueMapper: (v: unknown) => v,
            rpcValueMapper: (v: unknown) => v,
        }));

        renderHook(() => useLiveQuery(factory as never, [client, addr]), { wrapper: wrap(client) });
        expect(factory).toHaveBeenCalled();
        expect(getAccountInfo).toHaveBeenCalledWith(addr, { encoding: 'base64' });
        expect(accountNotifications).toHaveBeenCalledWith(addr, { encoding: 'base64' });
    });

    it('passes an AbortSignal to the factory that aborts on dep change', () => {
        const signals: AbortSignal[] = [];
        const getFoo = vi.fn(() => stubRpcRequest(() => new Promise(() => {})));
        const fooNotifications = vi.fn(() => stubRpcSubscription().request);
        const client = createClientWithRpc({
            rpc: { getFoo },
            rpcSubscriptions: { fooNotifications },
        });

        const factory = (signal: AbortSignal) => {
            signals.push(signal);
            return {
                rpcRequest: (client.rpc as never as { getFoo: () => never }).getFoo(),
                rpcSubscriptionRequest: (
                    client.rpcSubscriptions as never as { fooNotifications: () => never }
                ).fooNotifications(),
                rpcSubscriptionValueMapper: (v: unknown) => v,
                rpcValueMapper: (v: unknown) => v,
            };
        };

        const { rerender } = renderHook(({ dep }: { dep: number }) => useLiveQuery(factory as never, [client, dep]), {
            initialProps: { dep: 1 },
            wrapper: wrap(client),
        });
        expect(signals).toHaveLength(1);
        expect(signals[0]?.aborted).toBe(false);

        rerender({ dep: 2 });
        expect(signals).toHaveLength(2);
        expect(signals[0]?.aborted).toBe(true);
        expect(signals[1]?.aborted).toBe(false);
    });

    it('applies the mapper to an RPC response value', async () => {
        const deferred = createDeferred<{ context: { slot: bigint }; value: number }>();
        const getFoo = vi.fn(() => stubRpcRequest(() => deferred.promise));
        const fooNotifications = vi.fn(() => stubRpcSubscription().request);
        const client = createClientWithRpc({
            rpc: { getFoo },
            rpcSubscriptions: { fooNotifications },
        });

        const { result } = renderHook(
            () =>
                useLiveQuery(
                    _signal => ({
                        rpcRequest: (client.rpc as never as { getFoo: () => never }).getFoo(),
                        rpcSubscriptionRequest: (
                            client.rpcSubscriptions as never as { fooNotifications: () => never }
                        ).fooNotifications(),
                        rpcSubscriptionValueMapper: (v: number) => v * 10,
                        rpcValueMapper: (v: number) => v * 2,
                    }),

                    [],
                ),
            { wrapper: wrap(client) },
        );

        deferred.resolve(rpcResponse(7, 1n));
        await waitFor(() => expect(result.current.data).toBe(14));
    });
});
