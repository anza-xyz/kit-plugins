import { createClient } from '@solana/kit';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
    ClientContext,
    usePlanTransaction,
    usePlanTransactions,
    useSendTransaction,
    useSendTransactions,
} from '../src';

function wrap(client: object): (props: { children: ReactNode }) => ReactNode {
    return ({ children }) => <ClientContext.Provider value={client as never}>{children}</ClientContext.Provider>;
}

describe.skipIf(!__BROWSER__ && !__REACTNATIVE__)('transaction action hooks', () => {
    it('useSendTransaction throws when `sendTransaction` is not installed', () => {
        const client = {} as never;
        expect(() => renderHook(() => useSendTransaction(), { wrapper: wrap(client) })).toThrow(
            /useSendTransaction\(\) requires `client.sendTransaction`/,
        );
    });

    it('useSendTransactions throws when `sendTransactions` is not installed', () => {
        const client = {} as never;
        expect(() => renderHook(() => useSendTransactions(), { wrapper: wrap(client) })).toThrow(
            /useSendTransactions\(\) requires `client.sendTransactions`/,
        );
    });

    it('usePlanTransaction throws when `planTransaction` is not installed', () => {
        const client = {} as never;
        expect(() => renderHook(() => usePlanTransaction(), { wrapper: wrap(client) })).toThrow(
            /usePlanTransaction\(\) requires `client.planTransaction`/,
        );
    });

    it('usePlanTransactions throws when `planTransactions` is not installed', () => {
        const client = {} as never;
        expect(() => renderHook(() => usePlanTransactions(), { wrapper: wrap(client) })).toThrow(
            /usePlanTransactions\(\) requires `client.planTransactions`/,
        );
    });

    it('useSendTransaction threads the hook-managed AbortSignal into the client call', async () => {
        const sendTransaction = vi.fn().mockResolvedValue({ signature: 'sig' });
        const client = createClient().use(c => ({ ...c, sendTransaction }));
        const { result } = renderHook(() => useSendTransaction(), { wrapper: wrap(client) });

        await act(async () => {
            await result.current.send('ix' as never);
        });
        expect(sendTransaction).toHaveBeenCalledTimes(1);
        const [input, config] = sendTransaction.mock.calls[0] as [unknown, { abortSignal?: AbortSignal }];
        expect(input).toBe('ix');
        expect(config?.abortSignal).toBeInstanceOf(AbortSignal);
        expect(result.current.isSuccess).toBe(true);
        expect(result.current.data).toEqual({ signature: 'sig' });
    });

    it('usePlanTransaction threads the signal into the client call', async () => {
        const planTransaction = vi.fn().mockResolvedValue({ message: {} });
        const client = createClient().use(c => ({ ...c, planTransaction }));
        const { result } = renderHook(() => usePlanTransaction(), { wrapper: wrap(client) });

        await act(async () => {
            await result.current.send('ix' as never);
        });
        const config = (planTransaction.mock.calls[0] as [unknown, { abortSignal?: AbortSignal }])[1];
        expect(config?.abortSignal).toBeInstanceOf(AbortSignal);
        expect(result.current.isSuccess).toBe(true);
    });

    it('caller-supplied config is preserved but the hook-managed abortSignal wins', async () => {
        const sendTransaction = vi.fn().mockResolvedValue({ signature: 'sig' });
        const client = createClient().use(c => ({ ...c, sendTransaction }));
        const { result } = renderHook(() => useSendTransaction(), { wrapper: wrap(client) });

        const callerController = new AbortController();
        await act(async () => {
            await result.current.send(
                'ix' as never,
                {
                    abortSignal: callerController.signal,
                    commitment: 'finalized',
                } as never,
            );
        });
        const config = (sendTransaction.mock.calls[0] as [unknown, Record<string, unknown>])[1];
        expect(config.commitment).toBe('finalized');
        // Hook's signal supersedes the caller-supplied one so supersede/reset
        // semantics still work.
        expect(config.abortSignal).not.toBe(callerController.signal);
        expect(config.abortSignal).toBeInstanceOf(AbortSignal);
    });
});
