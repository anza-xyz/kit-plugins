/**
 * @vitest-environment happy-dom
 */
import type { Address, TransactionSigner } from '@solana/kit';
import { address } from '@solana/kit';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { useIdentity, usePayer } from '../src/hooks/signers';
import { expectingError, Providers } from './helpers';

const A_ADDRESS: Address = address('11111111111111111111111111111111');
const B_ADDRESS: Address = address('So11111111111111111111111111111111111111112');

function makeSigner(addr: Address): TransactionSigner {
    return {
        address: addr,
        signAndSendTransactions: async () => [],
    } as unknown as TransactionSigner;
}

describe('usePayer', () => {
    it('returns the installed static payer', () => {
        const mySigner = makeSigner(A_ADDRESS);
        const wrapper = ({ children }: { children: ReactNode }) => (
            <Providers extensions={{ payer: mySigner }}>{children}</Providers>
        );
        const { result } = renderHook(() => usePayer(), { wrapper });
        expect(result.current).toBe(mySigner);
    });

    it('throws when no payer is installed', () => {
        const wrapper = ({ children }: { children: ReactNode }) => <Providers>{children}</Providers>;
        expectingError(() => {
            expect(() => renderHook(() => usePayer(), { wrapper })).toThrow(/usePayer.*client\.payer/s);
        });
    });

    it('returns null when the payer getter throws (wallet not connected)', () => {
        // Reactive plugins expose `payer` as a throwing getter. Simulate that
        // with Object.defineProperty.
        const reactive: object = {};
        Object.defineProperty(reactive, 'payer', {
            configurable: true,
            enumerable: true,
            get: () => {
                throw new Error('wallet not connected');
            },
        });
        const wrapper = ({ children }: { children: ReactNode }) => (
            <Providers extensions={reactive as { payer: TransactionSigner }}>{children}</Providers>
        );
        const { result } = renderHook(() => usePayer(), { wrapper });
        expect(result.current).toBe(null);
    });

    it('re-renders when subscribeToPayer notifies', () => {
        let current: TransactionSigner | null = makeSigner(A_ADDRESS);
        const listeners = new Set<() => void>();
        const reactive = {
            get payer() {
                return current;
            },
            subscribeToPayer: (listener: () => void) => {
                listeners.add(listener);
                return () => listeners.delete(listener);
            },
        };
        const wrapper = ({ children }: { children: ReactNode }) => (
            <Providers extensions={reactive}>{children}</Providers>
        );
        const { result } = renderHook(() => usePayer(), { wrapper });
        expect(result.current?.address).toBe(A_ADDRESS);
        act(() => {
            current = makeSigner(B_ADDRESS);
            listeners.forEach(l => l());
        });
        expect(result.current?.address).toBe(B_ADDRESS);
    });

    it('tracks a full null → value → null cycle (wallet disconnect/reconnect)', () => {
        let current: TransactionSigner | null = null;
        const listeners = new Set<() => void>();
        const reactive = {
            get payer() {
                return current;
            },
            subscribeToPayer: (listener: () => void) => {
                listeners.add(listener);
                return () => listeners.delete(listener);
            },
        };
        const wrapper = ({ children }: { children: ReactNode }) => (
            <Providers extensions={reactive}>{children}</Providers>
        );
        const { result } = renderHook(() => usePayer(), { wrapper });
        expect(result.current).toBe(null);
        act(() => {
            current = makeSigner(A_ADDRESS);
            listeners.forEach(l => l());
        });
        expect(result.current?.address).toBe(A_ADDRESS);
        act(() => {
            current = null;
            listeners.forEach(l => l());
        });
        expect(result.current).toBe(null);
    });
});

describe('useIdentity', () => {
    it('returns the installed static identity', () => {
        const mySigner = makeSigner(A_ADDRESS);
        const wrapper = ({ children }: { children: ReactNode }) => (
            <Providers extensions={{ identity: mySigner }}>{children}</Providers>
        );
        const { result } = renderHook(() => useIdentity(), { wrapper });
        expect(result.current).toBe(mySigner);
    });

    it('throws when no identity is installed', () => {
        const wrapper = ({ children }: { children: ReactNode }) => <Providers>{children}</Providers>;
        expectingError(() => {
            expect(() => renderHook(() => useIdentity(), { wrapper })).toThrow(/useIdentity.*client\.identity/s);
        });
    });

    it('returns null when the identity getter throws (wallet not connected)', () => {
        // Reactive plugins expose `identity` as a throwing getter when no
        // wallet is connected. Simulate that with Object.defineProperty.
        const reactive: object = {};
        Object.defineProperty(reactive, 'identity', {
            configurable: true,
            enumerable: true,
            get: () => {
                throw new Error('wallet not connected');
            },
        });
        const wrapper = ({ children }: { children: ReactNode }) => (
            <Providers extensions={reactive as { identity: TransactionSigner }}>{children}</Providers>
        );
        const { result } = renderHook(() => useIdentity(), { wrapper });
        expect(result.current).toBe(null);
    });

    it('re-renders when subscribeToIdentity notifies', () => {
        let current: TransactionSigner | null = makeSigner(A_ADDRESS);
        const listeners = new Set<() => void>();
        const reactive = {
            get identity() {
                return current;
            },
            subscribeToIdentity: (listener: () => void) => {
                listeners.add(listener);
                return () => listeners.delete(listener);
            },
        };
        const wrapper = ({ children }: { children: ReactNode }) => (
            <Providers extensions={reactive}>{children}</Providers>
        );
        const { result } = renderHook(() => useIdentity(), { wrapper });
        expect(result.current?.address).toBe(A_ADDRESS);
        act(() => {
            current = makeSigner(B_ADDRESS);
            listeners.forEach(l => l());
        });
        expect(result.current?.address).toBe(B_ADDRESS);
    });

    it('tracks a full null → value → null cycle (wallet disconnect/reconnect)', () => {
        let current: TransactionSigner | null = null;
        const listeners = new Set<() => void>();
        const reactive = {
            get identity() {
                return current;
            },
            subscribeToIdentity: (listener: () => void) => {
                listeners.add(listener);
                return () => listeners.delete(listener);
            },
        };
        const wrapper = ({ children }: { children: ReactNode }) => (
            <Providers extensions={reactive}>{children}</Providers>
        );
        const { result } = renderHook(() => useIdentity(), { wrapper });
        expect(result.current).toBe(null);
        act(() => {
            current = makeSigner(A_ADDRESS);
            listeners.forEach(l => l());
        });
        expect(result.current?.address).toBe(A_ADDRESS);
        act(() => {
            current = null;
            listeners.forEach(l => l());
        });
        expect(result.current).toBe(null);
    });
});
