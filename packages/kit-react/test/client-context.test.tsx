/**
 * @vitest-environment happy-dom
 */
import type { Client } from '@solana/kit';
import { createClient } from '@solana/kit';
import { cleanup, render, renderHook } from '@testing-library/react';
import { type ReactNode, Suspense } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { KitClientProvider, useChain, useClient } from '../src/client-context';
import { expectingError } from './helpers';

function syncWrapper({ children }: { children: ReactNode }) {
    const client = createClient();
    return (
        <KitClientProvider client={client} chain="solana:devnet">
            {children}
        </KitClientProvider>
    );
}

function syncWrapperWithoutChain({ children }: { children: ReactNode }) {
    return <KitClientProvider client={createClient()}>{children}</KitClientProvider>;
}

afterEach(() => cleanup());

describe('KitClientProvider', () => {
    it('publishes the caller-owned client to the subtree', () => {
        const client = createClient();
        const wrapper = ({ children }: { children: ReactNode }) => (
            <KitClientProvider client={client}>{children}</KitClientProvider>
        );
        const { result } = renderHook(() => useClient(), { wrapper });
        expect(result.current).toBe(client);
    });

    it('does not require chain to be set', () => {
        const { result } = renderHook(() => useClient(), { wrapper: syncWrapperWithoutChain });
        expect(Object.keys(result.current)).toContain('use');
    });

    it('throws when useClient() is used outside a provider', () => {
        expectingError(() => {
            expect(() => renderHook(() => useClient())).toThrow(/must be called inside a <KitClientProvider>/);
        });
    });

    it('renders the Suspense fallback while the client promise is pending', () => {
        const clientPromise = new Promise<Client<object>>(() => {
            // never resolves
        });
        function Probe() {
            useClient();
            return <span data-testid="probe">ready</span>;
        }
        const { queryByTestId } = render(
            <Suspense fallback={<span data-testid="fallback">pending</span>}>
                <KitClientProvider client={clientPromise}>
                    <Probe />
                </KitClientProvider>
            </Suspense>,
        );
        expect(queryByTestId('fallback')).not.toBeNull();
        expect(queryByTestId('probe')).toBeNull();
    });

    // Note: resolution-and-retry through Suspense is not exercised here.
    // happy-dom + vitest does not flush React 19's Suspense scheduler after
    // a promise settles — even native `React.use(promise)` reproduces the
    // same hang in this environment. The end-to-end behavior is covered by
    // composition: the shim's pending/fulfilled/rejected contract is
    // unit-tested in `use-promise.test.ts`, and Suspense's retry against a
    // settled promise is React's own contract. We assert here that the
    // suspend half of the chain (throw → fallback) is wired correctly.
});

describe('useChain', () => {
    it('reads the chain set on KitClientProvider', () => {
        const { result } = renderHook(() => useChain(), { wrapper: syncWrapper });
        expect(result.current).toBe('solana:devnet');
    });

    it('throws when no ancestor has published a chain', () => {
        expectingError(() => {
            expect(() => renderHook(() => useChain(), { wrapper: syncWrapperWithoutChain })).toThrow(
                /useChain\(\) requires a chain/,
            );
        });
    });
});
