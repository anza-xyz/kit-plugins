/**
 * @vitest-environment happy-dom
 */
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { usePlanTransaction, usePlanTransactions } from '../src/hooks/use-plan-transaction';
import { useSendTransaction, useSendTransactions } from '../src/hooks/use-send-transaction';
import { expectingError, Providers } from './helpers';

function wrapper({ children }: { children: ReactNode }) {
    return <Providers>{children}</Providers>;
}

describe('useSendTransaction / useSendTransactions', () => {
    it('useSendTransaction throws when sendTransaction is missing', () => {
        expectingError(() => {
            expect(() => renderHook(() => useSendTransaction(), { wrapper })).toThrow(
                /useSendTransaction.*client\.sendTransaction/s,
            );
        });
    });

    it('useSendTransactions throws when sendTransactions is missing', () => {
        expectingError(() => {
            expect(() => renderHook(() => useSendTransactions(), { wrapper })).toThrow(
                /useSendTransactions.*client\.sendTransactions/s,
            );
        });
    });

    it('useSendTransaction delegates to client.sendTransaction with an abort signal', async () => {
        const sendTransaction = vi.fn((_input: unknown, _config: unknown) => Promise.resolve('SIGNATURE' as unknown));
        const wrapperWithSend = ({ children }: { children: ReactNode }) => (
            <Providers extensions={{ sendTransaction }}>{children}</Providers>
        );
        const { result } = renderHook(() => useSendTransaction(), { wrapper: wrapperWithSend });
        const out = await act(async () => result.current.sendAsync('INPUT' as never));
        expect(out).toBe('SIGNATURE');
        expect(sendTransaction).toHaveBeenCalledTimes(1);
        const [input, config] = sendTransaction.mock.calls[0]!;
        expect(input).toBe('INPUT');
        expect((config as { abortSignal: AbortSignal }).abortSignal).toBeInstanceOf(AbortSignal);
    });

    it('useSendTransactions delegates to client.sendTransactions with an abort signal', async () => {
        const sendTransactions = vi.fn((_input: unknown, _config: unknown) =>
            Promise.resolve('PLAN_RESULT' as unknown),
        );
        const wrapperWithSend = ({ children }: { children: ReactNode }) => (
            <Providers extensions={{ sendTransactions }}>{children}</Providers>
        );
        const { result } = renderHook(() => useSendTransactions(), { wrapper: wrapperWithSend });
        const out = await act(async () => result.current.sendAsync('INPUT' as never));
        expect(out).toBe('PLAN_RESULT');
        expect(sendTransactions).toHaveBeenCalledTimes(1);
        const [input, config] = sendTransactions.mock.calls[0]!;
        expect(input).toBe('INPUT');
        expect((config as { abortSignal: AbortSignal }).abortSignal).toBeInstanceOf(AbortSignal);
    });

    it('useSendTransaction aborts the first send when a second is fired (abort-on-supersede)', async () => {
        // First invocation hangs until aborted; second invocation resolves.
        let firstSignal: AbortSignal | undefined;
        let callCount = 0;
        const sendTransaction = vi.fn((_input: unknown, config: { abortSignal: AbortSignal }) => {
            callCount += 1;
            if (callCount === 1) {
                firstSignal = config.abortSignal;
                return new Promise((_resolve, reject) => {
                    config.abortSignal.addEventListener('abort', () =>
                        reject(new DOMException('aborted', 'AbortError')),
                    );
                });
            }
            return Promise.resolve('SIG2' as unknown);
        });
        const wrapperWithSend = ({ children }: { children: ReactNode }) => (
            <Providers extensions={{ sendTransaction }}>{children}</Providers>
        );
        const { result } = renderHook(() => useSendTransaction(), { wrapper: wrapperWithSend });
        act(() => {
            result.current.send('FIRST' as never);
        });
        expect(firstSignal?.aborted).toBe(false);
        await act(async () => {
            await result.current.sendAsync('SECOND' as never);
        });
        expect(firstSignal?.aborted).toBe(true);
        expect(result.current.data).toBe('SIG2');
    });
});

describe('usePlanTransaction / usePlanTransactions', () => {
    it('usePlanTransaction throws when planTransaction is missing', () => {
        expectingError(() => {
            expect(() => renderHook(() => usePlanTransaction(), { wrapper })).toThrow(
                /usePlanTransaction.*client\.planTransaction/s,
            );
        });
    });

    it('usePlanTransactions throws when planTransactions is missing', () => {
        expectingError(() => {
            expect(() => renderHook(() => usePlanTransactions(), { wrapper })).toThrow(
                /usePlanTransactions.*client\.planTransactions/s,
            );
        });
    });

    it('usePlanTransaction delegates to client.planTransaction with an abort signal', async () => {
        const planTransaction = vi.fn((_input: unknown, _config: unknown) => Promise.resolve('PLAN' as unknown));
        const wrapperWithPlan = ({ children }: { children: ReactNode }) => (
            <Providers extensions={{ planTransaction }}>{children}</Providers>
        );
        const { result } = renderHook(() => usePlanTransaction(), { wrapper: wrapperWithPlan });
        const out = await act(async () => result.current.sendAsync('INPUT' as never));
        expect(out).toBe('PLAN');
        expect(planTransaction).toHaveBeenCalledTimes(1);
        const [input, config] = planTransaction.mock.calls[0]!;
        expect(input).toBe('INPUT');
        expect((config as { abortSignal: AbortSignal }).abortSignal).toBeInstanceOf(AbortSignal);
    });

    it('usePlanTransactions delegates to client.planTransactions with an abort signal', async () => {
        const planTransactions = vi.fn((_input: unknown, _config: unknown) => Promise.resolve('PLANS' as unknown));
        const wrapperWithPlan = ({ children }: { children: ReactNode }) => (
            <Providers extensions={{ planTransactions }}>{children}</Providers>
        );
        const { result } = renderHook(() => usePlanTransactions(), { wrapper: wrapperWithPlan });
        const out = await act(async () => result.current.sendAsync('INPUT' as never));
        expect(out).toBe('PLANS');
        expect(planTransactions).toHaveBeenCalledTimes(1);
        const [input, config] = planTransactions.mock.calls[0]!;
        expect(input).toBe('INPUT');
        expect((config as { abortSignal: AbortSignal }).abortSignal).toBeInstanceOf(AbortSignal);
    });
});
