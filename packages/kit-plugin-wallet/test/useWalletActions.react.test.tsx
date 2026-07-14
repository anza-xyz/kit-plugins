import { renderHook } from '@testing-library/react';
import type { UiWallet, UiWalletAccount } from '@wallet-standard/ui';
import { describe, expect, it, vi } from 'vitest';

import { useConnect, useDisconnect, useSelectAccount, useSignIn, useSignMessage } from '../src/react';
import type { ClientWithWallet } from '../src/types';

/** Wrap a wallet namespace in a client so it can be passed to a hook. */
function clientFor(wallet: object): ClientWithWallet {
    return { wallet } as never;
}

const uiWallet = {} as UiWallet;
const account = {} as UiWalletAccount;

describe('useConnect', () => {
    it('dispatches connect with the wallet and a threaded abort signal, returning its result', async () => {
        const accounts = [account];
        const connect = vi.fn().mockResolvedValue(accounts);
        const { result: hook } = renderHook(() => useConnect(clientFor({ connect })));

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
        const { result: hook } = renderHook(() => useConnect(clientFor({ connect })));

        await expect(hook.current.dispatchAsync(uiWallet)).rejects.toBe(error);
    });
});

describe('useDisconnect', () => {
    it('dispatches disconnect for the active wallet with a threaded abort signal', async () => {
        const disconnect = vi.fn().mockResolvedValue(undefined);
        const { result: hook } = renderHook(() => useDisconnect(clientFor({ disconnect })));

        await hook.current.dispatchAsync();

        expect(disconnect).toHaveBeenCalledWith(
            undefined,
            expect.objectContaining({ abortSignal: expect.any(AbortSignal) }),
        );
    });

    it('dispatches disconnect for a specific wallet with a threaded abort signal', async () => {
        const disconnect = vi.fn().mockResolvedValue(undefined);
        const { result: hook } = renderHook(() => useDisconnect(clientFor({ disconnect })));

        await hook.current.dispatchAsync(uiWallet);

        expect(disconnect).toHaveBeenCalledWith(
            uiWallet,
            expect.objectContaining({ abortSignal: expect.any(AbortSignal) }),
        );
    });
});

describe('useSignIn', () => {
    it('dispatches signIn with the wallet, input, and a threaded abort signal', async () => {
        const output = { account: {} };
        const signIn = vi.fn().mockResolvedValue(output);
        const { result: hook } = renderHook(() => useSignIn(clientFor({ signIn })));

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
        const { result: hook } = renderHook(() => useSignMessage(clientFor({ signMessage })));

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
        const client = clientFor({ selectAccount });
        const { result: hook, rerender } = renderHook(() => useSelectAccount(client));

        const first = hook.current;
        first(account);
        expect(selectAccount).toHaveBeenCalledWith(account);

        rerender();
        expect(hook.current).toBe(first);
    });
});
