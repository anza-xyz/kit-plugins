import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { ClientContext } from '../../src';
import { useConnectedWallet, useWallets, useWalletSigner, useWalletState, useWalletStatus } from '../../src/wallet';
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

    it('useConnectedWallet returns null when disconnected and {account, wallet} when connected', () => {
        const wallet = createFakeWallet();
        const client = createClientWithWallet(wallet.namespace);
        const { result } = renderHook(() => useConnectedWallet(), { wrapper: wrap(client) });

        expect(result.current).toBeNull();

        const account = { address: '11111111111111111111111111111111' } as never;
        const walletHandle = { name: 'A' } as never;
        act(() =>
            wallet.setState({
                connected: { account, signer: null, wallet: walletHandle },
                status: 'connected',
            }),
        );
        expect(result.current).toEqual({ account, wallet: walletHandle });
        // @ts-expect-error signer is no longer part of ConnectedWallet
        expect(result.current?.signer).toBeUndefined();
    });

    it('useConnectedWallet keeps referential identity across signer-only changes', () => {
        const address = '11111111111111111111111111111111';
        const account = { address } as never;
        const walletHandle = { name: 'A' } as never;
        const wallet = createFakeWallet({
            connected: { account, signer: null, wallet: walletHandle },
            status: 'connected',
        });
        const client = createClientWithWallet(wallet.namespace);
        const { result } = renderHook(() => useConnectedWallet(), { wrapper: wrap(client) });

        const first = result.current;
        act(() =>
            wallet.setState({
                connected: { account, signer: { address } as never, wallet: walletHandle },
            }),
        );
        // Signer changed upstream but account + wallet are identical — projection
        // reuses the previous object so consumers skip the re-render.
        expect(result.current).toBe(first);
    });

    it('useWalletSigner returns the connected signer and null when disconnected', () => {
        const wallet = createFakeWallet();
        const client = createClientWithWallet(wallet.namespace);
        const { result } = renderHook(() => useWalletSigner(), { wrapper: wrap(client) });

        expect(result.current).toBeNull();

        const address = '11111111111111111111111111111111';
        const signer = { address } as unknown as NonNullable<ReturnType<typeof useWalletSigner>>;
        act(() =>
            wallet.setState({
                connected: {
                    account: { address } as never,
                    signer,
                    wallet: { name: 'A' } as never,
                },
                status: 'connected',
            }),
        );
        expect(result.current).toBe(signer);

        // Read-only wallet: connected but no signer.
        act(() =>
            wallet.setState({
                connected: {
                    account: { address } as never,
                    signer: null,
                    wallet: { name: 'A' } as never,
                },
            }),
        );
        expect(result.current).toBeNull();
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
