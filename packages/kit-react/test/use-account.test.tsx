import type { Decoder } from '@solana/kit';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ClientContext, useAccount } from '../src';
import { createClientWithRpc, createDeferred, rpcResponse, stubRpcRequest, stubRpcSubscription } from './_setup-rpc';

function wrap(client: object): (props: { children: ReactNode }) => ReactNode {
    return ({ children }) => <ClientContext.Provider value={client as never}>{children}</ClientContext.Provider>;
}

// A base64 payload representing any 4-byte account data. Content is immaterial
// — the decoder stub below returns a fixed object regardless.
const BASE64_DATA = 'AAECAw=='; // [0,1,2,3]

describe.skipIf(!__BROWSER__ && !__REACTNATIVE__)('useAccount', () => {
    it('throws a capability error when the RPC plugin is not installed', () => {
        const client = {} as never;
        expect(() => renderHook(() => useAccount('addr' as never), { wrapper: wrap(client) })).toThrow(
            /useAccount\(\) requires `client.rpc` and `client.rpcSubscriptions`/,
        );
    });

    it('reports a disabled snapshot when address is null', () => {
        const client = createClientWithRpc({ rpc: {}, rpcSubscriptions: {} });
        const { result } = renderHook(() => useAccount(null), { wrapper: wrap(client) });
        expect(result.current).toEqual({
            data: undefined,
            error: undefined,
            isLoading: false,
            slot: undefined,
        });
    });

    it('calls getAccountInfo + accountNotifications with encoding:base64', () => {
        const getAccountInfo = vi.fn(() => stubRpcRequest(() => new Promise(() => {})));
        const accountNotifications = vi.fn(() => stubRpcSubscription().request);

        const client = createClientWithRpc({
            rpc: { getAccountInfo },
            rpcSubscriptions: { accountNotifications },
        });
        const addr = 'FnHyam9w4NZoWR6mKN1CuGBritdsEWZQa4Z4oawLZGxa' as never;
        renderHook(() => useAccount(addr), { wrapper: wrap(client) });

        expect(getAccountInfo).toHaveBeenCalledWith(addr, { encoding: 'base64' });
        expect(accountNotifications).toHaveBeenCalledWith(addr, { encoding: 'base64' });
    });

    it('returns an EncodedAccount when no decoder is provided', async () => {
        const deferred = createDeferred<{
            context: { slot: bigint };
            value: {
                data: [string, 'base64'];
                executable: boolean;
                lamports: bigint;
                owner: string;
                rentEpoch: bigint;
                space: bigint;
            } | null;
        }>();
        const getAccountInfo = vi.fn(() => stubRpcRequest(() => deferred.promise));
        const accountNotifications = vi.fn(() => stubRpcSubscription().request);
        const client = createClientWithRpc({
            rpc: { getAccountInfo },
            rpcSubscriptions: { accountNotifications },
        });
        const addr = 'FnHyam9w4NZoWR6mKN1CuGBritdsEWZQa4Z4oawLZGxa' as never;
        const { result } = renderHook(() => useAccount(addr), { wrapper: wrap(client) });

        deferred.resolve(
            rpcResponse(
                {
                    data: [BASE64_DATA, 'base64'] as [string, 'base64'],
                    executable: false,
                    lamports: 1n,
                    owner: '11111111111111111111111111111111',
                    rentEpoch: 0n,
                    space: 4n,
                },
                5n,
            ),
        );
        await waitFor(() => expect(result.current.data).toBeDefined());
        // No decoder → EncodedAccount-shaped (no `data` typed as a decoded object).
        expect(result.current.data).toMatchObject({
            address: addr,
            executable: false,
            lamports: 1n,
        });
        expect(result.current.slot).toBe(5n);
    });

    it('returns a decoded Account when a decoder is provided', async () => {
        const deferred = createDeferred<{
            context: { slot: bigint };
            value: {
                data: [string, 'base64'];
                executable: boolean;
                lamports: bigint;
                owner: string;
                rentEpoch: bigint;
                space: bigint;
            } | null;
        }>();
        const getAccountInfo = vi.fn(() => stubRpcRequest(() => deferred.promise));
        const accountNotifications = vi.fn(() => stubRpcSubscription().request);
        const client = createClientWithRpc({
            rpc: { getAccountInfo },
            rpcSubscriptions: { accountNotifications },
        });

        type FakeDecoded = { kind: 'fake'; n: number };
        const decoder: Decoder<FakeDecoded> = {
            decode: () => ({ kind: 'fake', n: 42 }),
            fixedSize: 4,
            read: () => [{ kind: 'fake', n: 42 }, 4],
        } as never;

        const addr = 'FnHyam9w4NZoWR6mKN1CuGBritdsEWZQa4Z4oawLZGxa' as never;
        const { result } = renderHook(() => useAccount<FakeDecoded>(addr, decoder), { wrapper: wrap(client) });

        deferred.resolve(
            rpcResponse(
                {
                    data: [BASE64_DATA, 'base64'] as [string, 'base64'],
                    executable: false,
                    lamports: 1n,
                    owner: '11111111111111111111111111111111',
                    rentEpoch: 0n,
                    space: 4n,
                },
                7n,
            ),
        );
        await waitFor(() => expect(result.current.data).toBeDefined());
        const account = result.current.data as { data: FakeDecoded } | null;
        expect(account?.data).toEqual({ kind: 'fake', n: 42 });
    });
});
