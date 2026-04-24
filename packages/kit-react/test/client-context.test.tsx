/**
 * @vitest-environment happy-dom
 */
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { ChainProvider, KitClientProvider, useChain, useClient } from '../src/client-context';

function wrapper({ children }: { children: ReactNode }) {
    return (
        <KitClientProvider>
            <ChainProvider chain="solana:devnet">{children}</ChainProvider>
        </KitClientProvider>
    );
}

function wrapperWithoutChain({ children }: { children: ReactNode }) {
    return <KitClientProvider>{children}</KitClientProvider>;
}

describe('KitClientProvider', () => {
    it('seeds a Kit client into context', () => {
        const { result } = renderHook(() => useClient(), { wrapper });
        expect(Object.keys(result.current)).toContain('use');
    });

    it('does not require chain to be set', () => {
        const { result } = renderHook(() => useClient(), { wrapper: wrapperWithoutChain });
        expect(Object.keys(result.current)).toContain('use');
    });

    it('throws when useClient() is used outside a provider', () => {
        // Suppress React's error log for this intentional error.
        const error = console.error;
        console.error = () => {};
        try {
            expect(() => renderHook(() => useClient())).toThrow(/must be called inside a <KitClientProvider>/);
        } finally {
            console.error = error;
        }
    });
});

describe('ChainProvider / useChain', () => {
    it('publishes chain to the subtree', () => {
        const { result } = renderHook(() => useChain(), { wrapper });
        expect(result.current).toBe('solana:devnet');
    });

    it('throws when chain is not set by any ancestor', () => {
        const error = console.error;
        console.error = () => {};
        try {
            expect(() => renderHook(() => useChain(), { wrapper: wrapperWithoutChain })).toThrow(
                /useChain\(\) requires a chain to be set/,
            );
        } finally {
            console.error = error;
        }
    });
});
