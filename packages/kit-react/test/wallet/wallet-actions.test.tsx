import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { ClientContext } from '../../src';
import { useConnectWallet, useDisconnectWallet, useSelectAccount, useSignIn, useSignMessage } from '../../src/wallet';
import { createClientWithWallet, createFakeWallet } from './_setup';

function wrap(client: object): (props: { children: ReactNode }) => ReactNode {
    return ({ children }) => <ClientContext.Provider value={client as never}>{children}</ClientContext.Provider>;
}

describe.skipIf(!__BROWSER__ && !__REACTNATIVE__)('wallet action hooks — ActionState shape', () => {
    it('useConnectWallet exposes send + booleans and calls through to the plugin', async () => {
        const wallet = createFakeWallet();
        const client = createClientWithWallet(wallet.namespace);
        const { result } = renderHook(() => useConnectWallet(), { wrapper: wrap(client) });

        expect(result.current.isIdle).toBe(true);
        expect(result.current.isRunning).toBe(false);

        const handle = { name: 'A' } as never;
        await act(async () => {
            await result.current.send(handle);
        });

        expect(wallet.connect).toHaveBeenCalledWith(handle);
        expect(result.current.isSuccess).toBe(true);
        expect(result.current.data).toEqual([]);
    });

    it('useDisconnectWallet exposes send + booleans and calls through', async () => {
        const wallet = createFakeWallet();
        const client = createClientWithWallet(wallet.namespace);
        const { result } = renderHook(() => useDisconnectWallet(), { wrapper: wrap(client) });

        await act(async () => {
            await result.current.send();
        });
        expect(wallet.disconnect).toHaveBeenCalledOnce();
        expect(result.current.isSuccess).toBe(true);
    });

    it('useSignMessage exposes send + booleans and calls through', async () => {
        const wallet = createFakeWallet();
        const client = createClientWithWallet(wallet.namespace);
        const { result } = renderHook(() => useSignMessage(), { wrapper: wrap(client) });

        const msg = new Uint8Array([1, 2, 3]);
        await act(async () => {
            await result.current.send(msg);
        });
        expect(wallet.signMessage).toHaveBeenCalledWith(msg);
        expect(result.current.isSuccess).toBe(true);
    });

    it('useSignIn exposes send + booleans and calls through with optional input', async () => {
        const wallet = createFakeWallet();
        const client = createClientWithWallet(wallet.namespace);
        const { result } = renderHook(() => useSignIn(), { wrapper: wrap(client) });

        const handle = { name: 'A' } as never;
        await act(async () => {
            await result.current.send(handle);
        });
        expect(wallet.signIn).toHaveBeenCalledWith(handle, {});
        expect(result.current.isSuccess).toBe(true);

        await act(async () => {
            await result.current.send(handle, { statement: 'Hello' });
        });
        expect(wallet.signIn).toHaveBeenLastCalledWith(handle, { statement: 'Hello' });
    });

    it('useSelectAccount stays a bare synchronous callback', () => {
        const wallet = createFakeWallet();
        const client = createClientWithWallet(wallet.namespace);
        const { result } = renderHook(() => useSelectAccount(), { wrapper: wrap(client) });

        const account = { address: '11111111111111111111111111111111' } as never;
        // Plain function, not an ActionState. Return type is `void`.
        const ret = result.current(account);
        expect(ret).toBeUndefined();
        expect(wallet.selectAccount).toHaveBeenCalledWith(account);
    });
});
