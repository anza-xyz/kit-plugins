import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { ClientContext, useConnectedWallet, useWallets, useWalletState, useWalletStatus } from '../src';
import { createClientWithWallet, createFakeWallet } from './_setup';

function wrap(client: object): (props: { children: ReactNode }) => ReactNode {
    return ({ children }) => <ClientContext.Provider value={client as never}>{children}</ClientContext.Provider>;
}

describe.skipIf(!__BROWSER__ && !__REACTNATIVE__)('wallet state hooks', () => {
    it('useWallets returns the current wallet list and updates on change', () => {
        const wallet = createFakeWallet({ wallets: [] });
        const client = createClientWithWallet(wallet.namespace);
        const { result } = renderHook(() => useWallets(), { wrapper: wrap(client) });

        expect(result.current).toEqual([]);

        const fakeUiWallet = { name: 'A' } as unknown as (typeof result.current)[number];
        act(() => wallet.setState({ wallets: [fakeUiWallet] }));
        expect(result.current).toEqual([fakeUiWallet]);
    });

    it('useWalletStatus returns the current status and updates on change', () => {
        const wallet = createFakeWallet({ status: 'disconnected' });
        const client = createClientWithWallet(wallet.namespace);
        const { result } = renderHook(() => useWalletStatus(), { wrapper: wrap(client) });

        expect(result.current).toBe('disconnected');
        act(() => wallet.setState({ status: 'connecting' }));
        expect(result.current).toBe('connecting');
    });

    it('useConnectedWallet returns null when disconnected and the connection when connected', () => {
        const wallet = createFakeWallet();
        const client = createClientWithWallet(wallet.namespace);
        const { result } = renderHook(() => useConnectedWallet(), { wrapper: wrap(client) });

        expect(result.current).toBeNull();

        const connected = {
            account: { address: '11111111111111111111111111111111' } as never,
            signer: null,
            wallet: { name: 'A' } as never,
        };
        act(() => wallet.setState({ connected, status: 'connected' }));
        expect(result.current).toBe(connected);
    });

    it('useWalletState returns the full snapshot', () => {
        const wallet = createFakeWallet({ status: 'pending' });
        const client = createClientWithWallet(wallet.namespace);
        const { result } = renderHook(() => useWalletState(), { wrapper: wrap(client) });

        expect(result.current.status).toBe('pending');
        act(() => wallet.setState({ status: 'connected' }));
        expect(result.current.status).toBe('connected');
    });

    it('hooks throw when there is no wallet on the client', () => {
        const client = {} as never;
        expect(() => renderHook(() => useWallets(), { wrapper: wrap(client) })).toThrow(/WalletProvider/);
    });

    it('unsubscribes when the component unmounts', () => {
        const wallet = createFakeWallet();
        const client = createClientWithWallet(wallet.namespace);
        const { unmount } = renderHook(() => useWalletStatus(), { wrapper: wrap(client) });
        expect(wallet.listenerCount()).toBeGreaterThan(0);
        unmount();
        expect(wallet.listenerCount()).toBe(0);
    });
});
