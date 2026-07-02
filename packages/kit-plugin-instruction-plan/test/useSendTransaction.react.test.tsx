import type { ClientWithTransactionSending } from '@solana/kit';
import { ClientProvider } from '@solana/react';
import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useSendTransaction, useSendTransactions } from '../src/react';

type SendInput = Parameters<ClientWithTransactionSending['sendTransaction']>[0];

function wrapperFor(client: object) {
    return ({ children }: { children: ReactNode }) =>
        createElement(ClientProvider, { client: client as never }, children);
}

describe('useSendTransaction', () => {
    const input = {} as SendInput;

    it('throws at mount when the client lacks sendTransaction', () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        expect(() => renderHook(() => useSendTransaction(), { wrapper: wrapperFor({}) })).toThrow(/sendTransaction/);
        consoleError.mockRestore();
    });

    it('dispatches sendTransaction with input and a threaded abort signal, returning its result', async () => {
        const result = { kind: 'single' };
        const sendTransaction = vi.fn().mockResolvedValue(result);
        const { result: hook } = renderHook(() => useSendTransaction(), {
            wrapper: wrapperFor({ sendTransaction }),
        });

        const returned = await hook.current.dispatchAsync(input);

        expect(returned).toBe(result);
        expect(sendTransaction).toHaveBeenCalledWith(
            input,
            expect.objectContaining({ abortSignal: expect.any(AbortSignal) }),
        );
    });

    it('surfaces a rejecting client method via error/isError', async () => {
        const error = new Error('boom');
        const sendTransaction = vi.fn().mockRejectedValue(error);
        const { result: hook } = renderHook(() => useSendTransaction(), {
            wrapper: wrapperFor({ sendTransaction }),
        });

        await expect(hook.current.dispatchAsync(input)).rejects.toBe(error);
    });
});

describe('useSendTransactions', () => {
    const input = {} as SendInput;

    it('throws at mount when the client lacks sendTransactions', () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        expect(() => renderHook(() => useSendTransactions(), { wrapper: wrapperFor({}) })).toThrow(/sendTransactions/);
        consoleError.mockRestore();
    });

    it('dispatches sendTransactions with input and a threaded abort signal', async () => {
        const result = { kind: 'plan-result' };
        const sendTransactions = vi.fn().mockResolvedValue(result);
        const { result: hook } = renderHook(() => useSendTransactions(), {
            wrapper: wrapperFor({ sendTransactions }),
        });

        const returned = await hook.current.dispatchAsync(input);

        expect(returned).toBe(result);
        expect(sendTransactions).toHaveBeenCalledWith(
            input,
            expect.objectContaining({ abortSignal: expect.any(AbortSignal) }),
        );
    });
});
