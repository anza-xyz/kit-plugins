import { ClientProvider } from '@solana/react';
import { renderHook } from '@testing-library/react';
import type { UiWallet, UiWalletAccount } from '@wallet-standard/ui';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useConnect, useDisconnect, useSelectAccount, useSignIn, useSignMessage } from '../src/react';

function wrapperFor(wallet: object) {
    return ({ children }: { children: ReactNode }) =>
        createElement(ClientProvider, { client: { wallet } as never }, children);
}

const uiWallet = {} as UiWallet;
const account = {} as UiWalletAccount;

describe('useConnect', () => {
    it('throws at mount when the client lacks a wallet namespace', () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        expect(() =>
            renderHook(() => useConnect(), {
                wrapper: ({ children }) => createElement(ClientProvider, { client: {} as never }, children),
            }),
        ).toThrow(/useConnect/);
        consoleError.mockRestore();
    });

    it('dispatches connect with the wallet and a threaded abort signal, returning its result', async () => {
        const accounts = [account];
        const connect = vi.fn().mockResolvedValue(accounts);
        const { result: hook } = renderHook(() => useConnect(), { wrapper: wrapperFor({ connect }) });

        const returned = await hook.current.dispatchAsync(uiWallet);

        expect(returned).toBe(accounts);
        expect(connect).toHaveBeenCalledWith(
            uiWallet,
            expect.objectContaining({ abortSignal: expect.any(AbortSignal) }),
        );
    });

    it('surfaces a rejecting connect via the returned promise', async () => {
        const error = new Error('declined');
        const connect = vi.fn().mockRejectedValue(error);
        const { result: hook } = renderHook(() => useConnect(), { wrapper: wrapperFor({ connect }) });

        await expect(hook.current.dispatchAsync(uiWallet)).rejects.toBe(error);
    });
});

describe('useDisconnect', () => {
    it('dispatches disconnect with a threaded abort signal', async () => {
        const disconnect = vi.fn().mockResolvedValue(undefined);
        const { result: hook } = renderHook(() => useDisconnect(), { wrapper: wrapperFor({ disconnect }) });

        await hook.current.dispatchAsync();

        expect(disconnect).toHaveBeenCalledWith(expect.objectContaining({ abortSignal: expect.any(AbortSignal) }));
    });
});

describe('useSignIn', () => {
    it('dispatches signIn with the wallet, input, and a threaded abort signal', async () => {
        const output = { account: {} };
        const signIn = vi.fn().mockResolvedValue(output);
        const { result: hook } = renderHook(() => useSignIn(), { wrapper: wrapperFor({ signIn }) });

        const input = { domain: 'example.com' };
        const returned = await hook.current.dispatchAsync(uiWallet, input);

        expect(returned).toBe(output);
        expect(signIn).toHaveBeenCalledWith(
            uiWallet,
            input,
            expect.objectContaining({ abortSignal: expect.any(AbortSignal) }),
        );
    });
});

describe('useSignMessage', () => {
    it('dispatches signMessage with the message and a threaded abort signal', async () => {
        const signature = new Uint8Array(64);
        const signMessage = vi.fn().mockResolvedValue(signature);
        const { result: hook } = renderHook(() => useSignMessage(), { wrapper: wrapperFor({ signMessage }) });

        const message = new TextEncoder().encode('Hello');
        const returned = await hook.current.dispatchAsync(message);

        expect(returned).toBe(signature);
        expect(signMessage).toHaveBeenCalledWith(
            message,
            expect.objectContaining({ abortSignal: expect.any(AbortSignal) }),
        );
    });
});

describe('useSelectAccount', () => {
    it('returns a callback that forwards to the client, stable across renders', () => {
        const selectAccount = vi.fn();
        const { result: hook, rerender } = renderHook(() => useSelectAccount(), {
            wrapper: wrapperFor({ selectAccount }),
        });

        const first = hook.current;
        first(account);
        expect(selectAccount).toHaveBeenCalledWith(account);

        rerender();
        expect(hook.current).toBe(first);
    });
});
