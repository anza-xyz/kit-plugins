/**
 * @vitest-environment happy-dom
 */
import type { Address, Decoder, Slot, SolanaRpcResponse } from '@solana/kit';
import { address, createReactiveStoreWithInitialValueAndSlotTracking } from '@solana/kit';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useAccount } from '../src/hooks/use-account';
import { useBalance } from '../src/hooks/use-balance';
import { useLiveData } from '../src/hooks/use-live-data';
import { useTransactionConfirmation } from '../src/hooks/use-transaction-confirmation';
import { expectingError, Providers } from './helpers';

// Mock the single kit function useLiveData builds the store with, so tests
// can drive emissions / errors without real RPC traffic. All other kit
// exports pass through via `importOriginal`.
vi.mock('@solana/kit', async importOriginal => {
    const actual = await importOriginal<typeof import('@solana/kit')>();
    return {
        ...actual,
        createReactiveStoreWithInitialValueAndSlotTracking: vi.fn(),
    };
});

type ReactiveStore<T> = {
    getError: () => unknown;
    getState: () => T | undefined;
    subscribe: (listener: () => void) => () => void;
};

/**
 * A controllable fake of kit's `ReactiveStore` (the inner shape that
 * `createReactiveStoreWithInitialValueAndSlotTracking` returns, before
 * `liftToStreamStore` wraps it).
 */
function fakeKitReactiveStore<T>() {
    const listeners = new Set<() => void>();
    let data: T | undefined;
    let error: unknown;
    const notify = () => listeners.forEach(l => l());
    const store: ReactiveStore<T> = {
        getError: () => error,
        getState: () => data,
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };
    return {
        emit(value: T) {
            data = value;
            error = undefined;
            notify();
        },
        fail(err: unknown) {
            error = err;
            notify();
        },
        store,
    };
}

const FAKE_ADDRESS: Address = address('11111111111111111111111111111111');

function wrapper({ children }: { children: ReactNode }) {
    return <Providers>{children}</Providers>;
}

// Fake RPC / subscriptions shaped to satisfy the `ClientWithRpc*` capability
// checks. Every method returns an object that looks like a pending request
// but never gets read — these tests only exercise the null-gate / capability
// paths, which short-circuit before Kit touches the objects.
const fakeRpc = {
    rpc: {
        getAccountInfo: () => ({ send: () => Promise.resolve() }),
        getBalance: () => ({ send: () => Promise.resolve() }),
        getSignatureStatuses: () => ({ send: () => Promise.resolve() }),
    },
    rpcSubscriptions: {
        accountNotifications: () => ({ subscribe: () => ({}) }),
        signatureNotifications: () => ({ subscribe: () => ({}) }),
    },
};

function wrapperWithRpc({ children }: { children: ReactNode }) {
    return <Providers extensions={fakeRpc}>{children}</Providers>;
}

// The `disabled` lifecycle is live-client-only — in node, useLiveStore
// returns a permanent "loading" static store so SSR matches first-client
// render. Gate the disabled-state tests accordingly.
const IS_LIVE = __BROWSER__ || __REACTNATIVE__;

describe.skipIf(!IS_LIVE)('useLiveData (live-client)', () => {
    afterEach(() => vi.clearAllMocks());

    it('reports disabled when factory returns null and does not invoke the factory body', () => {
        const buildSpec = vi.fn(() => null);
        const { result } = renderHook(() => useLiveData(buildSpec, []), { wrapper });
        expect(result.current.status).toBe('disabled');
        expect(result.current.isLoading).toBe(false);
    });

    it('reports loading before the store has emitted', () => {
        const fake = fakeKitReactiveStore<SolanaRpcResponse<number>>();
        vi.mocked(createReactiveStoreWithInitialValueAndSlotTracking).mockReturnValue(fake.store);

        const { result } = renderHook(
            () =>
                useLiveData(
                    () => ({
                        rpcRequest: {} as never,
                        rpcSubscriptionRequest: {} as never,
                        rpcSubscriptionValueMapper: (v: number) => v,
                        rpcValueMapper: (v: number) => v,
                    }),
                    [],
                ),
            { wrapper },
        );
        expect(result.current.status).toBe('loading');
        expect(result.current.isLoading).toBe(true);
        expect(result.current.data).toBeUndefined();
    });

    it('transitions to loaded with data + slot when the store emits', () => {
        const fake = fakeKitReactiveStore<SolanaRpcResponse<number>>();
        vi.mocked(createReactiveStoreWithInitialValueAndSlotTracking).mockReturnValue(fake.store);

        const { result } = renderHook(
            () =>
                useLiveData(
                    () => ({
                        rpcRequest: {} as never,
                        rpcSubscriptionRequest: {} as never,
                        rpcSubscriptionValueMapper: (v: number) => v,
                        rpcValueMapper: (v: number) => v,
                    }),
                    [],
                ),
            { wrapper },
        );
        act(() => fake.emit({ context: { slot: 5n as Slot }, value: 42 }));
        expect(result.current.status).toBe('loaded');
        expect(result.current.data).toBe(42);
        expect(result.current.slot).toBe(5n);
    });

    it('surfaces errors from the store', () => {
        const fake = fakeKitReactiveStore<SolanaRpcResponse<number>>();
        vi.mocked(createReactiveStoreWithInitialValueAndSlotTracking).mockReturnValue(fake.store);

        const { result } = renderHook(
            () =>
                useLiveData(
                    () => ({
                        rpcRequest: {} as never,
                        rpcSubscriptionRequest: {} as never,
                        rpcSubscriptionValueMapper: (v: number) => v,
                        rpcValueMapper: (v: number) => v,
                    }),
                    [],
                ),
            { wrapper },
        );
        const err = new Error('boom');
        act(() => fake.fail(err));
        expect(result.current.status).toBe('error');
        expect(result.current.error).toBe(err);
    });
});

describe.skipIf(!IS_LIVE)('named live-data hooks (happy path, live-client)', () => {
    afterEach(() => vi.clearAllMocks());

    it('useAccount with a decoder requests base64 encoding and routes data through the decoder', () => {
        const fake = fakeKitReactiveStore<SolanaRpcResponse<unknown>>();
        vi.mocked(createReactiveStoreWithInitialValueAndSlotTracking).mockReturnValue(fake.store);

        const getAccountInfo = vi.fn(() => ({ send: vi.fn() }));
        const accountNotifications = vi.fn(() => ({ subscribe: vi.fn() }));
        const wrapperWithAccountRpc = ({ children }: { children: ReactNode }) => (
            <Providers
                extensions={{
                    rpc: { getAccountInfo },
                    rpcSubscriptions: { accountNotifications },
                }}
            >
                {children}
            </Providers>
        );

        // Decoder returns a typed struct from the raw bytes.
        const decoder = { decode: vi.fn(() => ({ kind: 'token', supply: 100n })) };
        const { result } = renderHook(
            () =>
                useAccount<{ kind: string; supply: bigint }>(
                    FAKE_ADDRESS,
                    decoder as unknown as Decoder<{ kind: string; supply: bigint }>,
                ),
            { wrapper: wrapperWithAccountRpc },
        );
        expect(result.current.status).toBe('loading');

        // Verify base64 encoding is requested (load-bearing for the decoder overload).
        expect(getAccountInfo).toHaveBeenCalledWith(FAKE_ADDRESS, { encoding: 'base64' });
        expect(accountNotifications).toHaveBeenCalledWith(FAKE_ADDRESS, { encoding: 'base64' });

        // Directly exercise the mapper from the spec: pass an RPC-shaped base64
        // account value and confirm the mapper parses + decodes it via the
        // supplied decoder.
        const [config] = vi.mocked(createReactiveStoreWithInitialValueAndSlotTracking).mock.calls[0]!;
        const rpcAccount = {
            data: ['AQID', 'base64'], // base64 of [1, 2, 3]
            executable: false,
            lamports: 1_000_000n,
            owner: FAKE_ADDRESS,
            rentEpoch: 0n,
            space: 3n,
        };
        const decoded = (config.rpcSubscriptionValueMapper as (v: unknown) => unknown)(rpcAccount);
        expect(decoder.decode).toHaveBeenCalled();
        expect(decoded).toMatchObject({ data: { kind: 'token', supply: 100n } });
    });

    it('useBalance passes the RPC request and subscription to the kit factory', () => {
        const fake = fakeKitReactiveStore<SolanaRpcResponse<bigint>>();
        vi.mocked(createReactiveStoreWithInitialValueAndSlotTracking).mockReturnValue(fake.store);

        const getBalanceReq = { send: vi.fn() };
        const accountNotifsReq = { subscribe: vi.fn() };
        const wrapperWithBalanceRpc = ({ children }: { children: ReactNode }) => (
            <Providers
                extensions={{
                    rpc: { getBalance: vi.fn(() => getBalanceReq) },
                    rpcSubscriptions: { accountNotifications: vi.fn(() => accountNotifsReq) },
                }}
            >
                {children}
            </Providers>
        );
        const { result } = renderHook(() => useBalance(FAKE_ADDRESS), { wrapper: wrapperWithBalanceRpc });
        expect(result.current.status).toBe('loading');

        const [config] = vi.mocked(createReactiveStoreWithInitialValueAndSlotTracking).mock.calls[0]!;
        expect(config.rpcRequest).toBe(getBalanceReq);
        expect(config.rpcSubscriptionRequest).toBe(accountNotifsReq);

        // Emit a balance and confirm it surfaces through the hook.
        act(() => fake.emit({ context: { slot: 10n as Slot }, value: 1_000_000n }));
        expect(result.current.status).toBe('loaded');
        expect(result.current.data).toBe(1_000_000n);
        expect(result.current.slot).toBe(10n);
    });
});

describe('named live-data hooks (capability checks run in every env)', () => {
    it('useBalance throws when no RPC is installed', () => {
        expectingError(() => {
            expect(() => renderHook(() => useBalance(FAKE_ADDRESS), { wrapper })).toThrow(/useBalance.*client\.rpc/s);
        });
    });

    it('useAccount throws when no RPC is installed', () => {
        expectingError(() => {
            expect(() => renderHook(() => useAccount(FAKE_ADDRESS), { wrapper })).toThrow(/useAccount.*client\.rpc/s);
        });
    });

    it('useTransactionConfirmation throws when no RPC is installed', () => {
        expectingError(() => {
            expect(() => renderHook(() => useTransactionConfirmation('sig' as never), { wrapper })).toThrow(
                /useTransactionConfirmation.*client\.rpc/s,
            );
        });
    });
});

describe.skipIf(!IS_LIVE)('named live-data hooks (null-gate, live-client)', () => {
    it('useBalance reports disabled when address is null', () => {
        const { result } = renderHook(() => useBalance(null), { wrapper: wrapperWithRpc });
        expect(result.current.status).toBe('disabled');
    });

    it('useAccount reports disabled when address is null', () => {
        const { result } = renderHook(() => useAccount(null), { wrapper: wrapperWithRpc });
        expect(result.current.status).toBe('disabled');
    });

    it('useTransactionConfirmation reports disabled when signature is null', () => {
        const { result } = renderHook(() => useTransactionConfirmation(null), { wrapper: wrapperWithRpc });
        expect(result.current.status).toBe('disabled');
    });
});
