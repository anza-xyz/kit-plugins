import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ClientContext, useTransactionConfirmation } from '../src';
import { createClientWithRpc, createDeferred, rpcResponse, stubRpcRequest, stubRpcSubscription } from './_setup-rpc';

function wrap(client: object): (props: { children: ReactNode }) => ReactNode {
    return ({ children }) => <ClientContext.Provider value={client as never}>{children}</ClientContext.Provider>;
}

describe.skipIf(!__BROWSER__ && !__REACTNATIVE__)('useTransactionConfirmation', () => {
    it('throws a capability error when the RPC plugin is not installed', () => {
        const client = {} as never;
        expect(() => renderHook(() => useTransactionConfirmation('sig' as never), { wrapper: wrap(client) })).toThrow(
            /useTransactionConfirmation\(\) requires `client.rpc` and `client.rpcSubscriptions`/,
        );
    });

    it('reports a disabled snapshot when signature is null', () => {
        const client = createClientWithRpc({ rpc: {}, rpcSubscriptions: {} });
        const { result } = renderHook(() => useTransactionConfirmation(null), { wrapper: wrap(client) });
        expect(result.current).toEqual({
            data: undefined,
            error: undefined,
            isLoading: false,
            slot: undefined,
        });
    });

    it('defaults to confirmed commitment when options is omitted', () => {
        const getSignatureStatuses = vi.fn(() => stubRpcRequest(() => new Promise(() => {})));
        const signatureNotifications = vi.fn(() => stubRpcSubscription().request);
        const client = createClientWithRpc({
            rpc: { getSignatureStatuses },
            rpcSubscriptions: { signatureNotifications },
        });
        const signature = '2id3YC2jK9G5Wo2phDx4gJVpZ7Y4dLWhx7Y2id3YC2jK9G5Wo2phDx4gJVpZ7Y4dLWhx' as never;
        renderHook(() => useTransactionConfirmation(signature), { wrapper: wrap(client) });

        expect(getSignatureStatuses).toHaveBeenCalledWith([signature]);
        expect(signatureNotifications).toHaveBeenCalledWith(signature, { commitment: 'confirmed' });
    });

    it('respects a caller-specified commitment', () => {
        const getSignatureStatuses = vi.fn(() => stubRpcRequest(() => new Promise(() => {})));
        const signatureNotifications = vi.fn(() => stubRpcSubscription().request);
        const client = createClientWithRpc({
            rpc: { getSignatureStatuses },
            rpcSubscriptions: { signatureNotifications },
        });
        const signature = '2id3YC2jK9G5Wo2phDx4gJVpZ7Y4dLWhx7Y2id3YC2jK9G5Wo2phDx4gJVpZ7Y4dLWhx' as never;
        renderHook(() => useTransactionConfirmation(signature, { commitment: 'finalized' }), { wrapper: wrap(client) });

        expect(signatureNotifications).toHaveBeenCalledWith(signature, { commitment: 'finalized' });
    });

    it('maps the initial getSignatureStatuses response shape', async () => {
        const deferred = createDeferred<{
            context: { slot: bigint };
            value: Array<{
                confirmationStatus: 'confirmed' | 'finalized' | null;
                confirmations: bigint | null;
                err: null;
            } | null>;
        }>();
        const getSignatureStatuses = vi.fn(() => stubRpcRequest(() => deferred.promise));
        const signatureNotifications = vi.fn(() => stubRpcSubscription().request);
        const client = createClientWithRpc({
            rpc: { getSignatureStatuses },
            rpcSubscriptions: { signatureNotifications },
        });
        const signature = '2id3YC2jK9G5Wo2phDx4gJVpZ7Y4dLWhx7Y2id3YC2jK9G5Wo2phDx4gJVpZ7Y4dLWhx' as never;
        const { result } = renderHook(() => useTransactionConfirmation(signature), { wrapper: wrap(client) });

        deferred.resolve(rpcResponse([{ confirmationStatus: 'confirmed', confirmations: 3n, err: null }], 42n));
        await waitFor(() => expect(result.current.data).toBeDefined());
        expect(result.current.data).toEqual({
            confirmationStatus: 'confirmed',
            confirmations: 3n,
            err: null,
        });
        expect(result.current.slot).toBe(42n);
    });
});
