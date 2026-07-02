import type { ClientWithTransactionPlanning } from '@solana/kit';
import { ClientProvider } from '@solana/react';
import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { usePlanTransaction, usePlanTransactions } from '../src/react';

type PlanInput = Parameters<ClientWithTransactionPlanning['planTransaction']>[0];

function wrapperFor(client: object) {
    return ({ children }: { children: ReactNode }) =>
        createElement(ClientProvider, { client: client as never }, children);
}

describe('usePlanTransaction', () => {
    const input = {} as PlanInput;

    it('throws at mount when the client lacks planTransaction', () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        expect(() => renderHook(() => usePlanTransaction(), { wrapper: wrapperFor({}) })).toThrow(/planTransaction/);
        consoleError.mockRestore();
    });

    it('dispatches planTransaction with input and a threaded abort signal', async () => {
        const message = { kind: 'message' };
        const planTransaction = vi.fn().mockResolvedValue(message);
        const { result: hook } = renderHook(() => usePlanTransaction(), {
            wrapper: wrapperFor({ planTransaction }),
        });

        const returned = await hook.current.dispatchAsync(input);

        expect(returned).toBe(message);
        expect(planTransaction).toHaveBeenCalledWith(
            input,
            expect.objectContaining({ abortSignal: expect.any(AbortSignal) }),
        );
    });
});

describe('usePlanTransactions', () => {
    const input = {} as PlanInput;

    it('throws at mount when the client lacks planTransactions', () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        expect(() => renderHook(() => usePlanTransactions(), { wrapper: wrapperFor({}) })).toThrow(/planTransactions/);
        consoleError.mockRestore();
    });

    it('dispatches planTransactions with input and a threaded abort signal', async () => {
        const plan = { kind: 'plan' };
        const planTransactions = vi.fn().mockResolvedValue(plan);
        const { result: hook } = renderHook(() => usePlanTransactions(), {
            wrapper: wrapperFor({ planTransactions }),
        });

        const returned = await hook.current.dispatchAsync(input);

        expect(returned).toBe(plan);
        expect(planTransactions).toHaveBeenCalledWith(
            input,
            expect.objectContaining({ abortSignal: expect.any(AbortSignal) }),
        );
    });
});
