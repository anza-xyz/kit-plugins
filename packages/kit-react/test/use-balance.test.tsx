import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ClientContext, useBalance } from '../src';
import { createClientWithRpc, createDeferred, rpcResponse, stubRpcRequest, stubRpcSubscription } from './_setup-rpc';

function wrap(client: object): (props: { children: ReactNode }) => ReactNode {
    return ({ children }) => <ClientContext.Provider value={client as never}>{children}</ClientContext.Provider>;
}

describe.skipIf(!__BROWSER__ && !__REACTNATIVE__)('useBalance', () => {
    it('throws a capability error when the RPC plugin is not installed', () => {
        const client = {} as never;
        expect(() => renderHook(() => useBalance('addr' as never), { wrapper: wrap(client) })).toThrow(
            /useBalance\(\) requires `client.rpc` and `client.rpcSubscriptions`/,
        );
    });

    it('reports a disabled snapshot when address is null', () => {
        const client = createClientWithRpc({ rpc: {}, rpcSubscriptions: {} });
        const { result } = renderHook(() => useBalance(null), { wrapper: wrap(client) });
        expect(result.current).toEqual({
            data: undefined,
            error: undefined,
            isLoading: false,
            slot: undefined,
        });
    });

    it('wires up getBalance + accountNotifications when an address is provided', async () => {
        const deferred = createDeferred<{ context: { slot: bigint }; value: bigint }>();
        const subscription = stubRpcSubscription<{ context: { slot: bigint }; value: { lamports: bigint } }>();
        const getBalance = vi.fn(() => stubRpcRequest(() => deferred.promise));
        const accountNotifications = vi.fn(() => subscription.request);

        const client = createClientWithRpc({
            rpc: { getBalance },
            rpcSubscriptions: { accountNotifications },
        });
        const addr = 'FnHyam9w4NZoWR6mKN1CuGBritdsEWZQa4Z4oawLZGxa' as never;
        const { result } = renderHook(() => useBalance(addr), { wrapper: wrap(client) });

        expect(getBalance).toHaveBeenCalledWith(addr);
        expect(accountNotifications).toHaveBeenCalledWith(addr);
        expect(result.current.isLoading).toBe(true);

        deferred.resolve(rpcResponse(1234n, 10n));
        await waitFor(() => expect(result.current.data).toBe(1234n));
        expect(result.current.slot).toBe(10n);
        expect(result.current.isLoading).toBe(false);
    });
});
