import { ClientProvider } from '@solana/react';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { UiWallet } from '@wallet-standard/ui';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useConnectedWallet, useWallets, useWalletStatus } from '../src/react';
import type { WalletState } from '../src/types';

// Unmount rendered trees between tests. This package doesn't enable vitest
// globals, so @testing-library/react's auto-cleanup isn't registered.
afterEach(cleanup);

/**
 * A minimal referentially-stable wallet store, mirroring the plugin's contract: `getState` returns
 * the same object until `setState` replaces it, and `subscribe` notifies listeners on change.
 */
function createFakeStore(initial: WalletState) {
    let state = initial;
    const listeners = new Set<() => void>();
    return {
        getState: () => state,
        setState(next: WalletState) {
            state = next;
            listeners.forEach(l => l());
        },
        subscribe(listener: () => void) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };
}

function wrapperFor(wallet: object) {
    return ({ children }: { children: ReactNode }) =>
        createElement(ClientProvider, { client: { wallet } as never }, children);
}

const INITIAL: WalletState = { connected: null, status: 'disconnected', wallets: [] };

describe('useWalletStatus', () => {
    it('throws at mount when the client lacks a wallet namespace', () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        expect(() =>
            renderHook(() => useWalletStatus(), {
                wrapper: ({ children }) => createElement(ClientProvider, { client: {} as never }, children),
            }),
        ).toThrow(/useWalletStatus/);
        consoleError.mockRestore();
    });

    it('returns the current status and updates when it changes', () => {
        const store = createFakeStore(INITIAL);
        const { result } = renderHook(() => useWalletStatus(), { wrapper: wrapperFor(store) });

        expect(result.current).toBe('disconnected');

        act(() => store.setState({ ...INITIAL, status: 'connecting' }));
        expect(result.current).toBe('connecting');
    });
});

describe('useConnectedWallet', () => {
    it('returns the active connection and updates when it changes', () => {
        const store = createFakeStore(INITIAL);
        const { result } = renderHook(() => useConnectedWallet(), { wrapper: wrapperFor(store) });

        expect(result.current).toBeNull();

        const connected = { account: {}, signer: null, wallet: {} } as WalletState['connected'];
        act(() => store.setState({ ...INITIAL, connected, status: 'connected' }));
        expect(result.current).toBe(connected);
    });
});

describe('useWallets', () => {
    it('returns the discovered wallets and updates when the list changes', () => {
        const store = createFakeStore(INITIAL);
        const { result } = renderHook(() => useWallets(), { wrapper: wrapperFor(store) });

        expect(result.current).toEqual([]);

        const wallets = [{} as UiWallet];
        act(() => store.setState({ ...INITIAL, wallets }));
        expect(result.current).toBe(wallets);
    });
});
