import { type Client, createClient } from '@solana/kit';
import { render, renderHook } from '@testing-library/react';
import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { KitClientProvider, useChain, useClient } from '../src';
import { disposeClient } from '../src/internal/dispose';

describe.skipIf(!__BROWSER__ && !__REACTNATIVE__)('KitClientProvider + useClient + useChain', () => {
    it('useClient throws when no provider is mounted', () => {
        expect(() => renderHook(() => useClient())).toThrow(/KitClientProvider/);
    });

    it('useChain throws when no provider is mounted', () => {
        expect(() => renderHook(() => useChain())).toThrow(/KitClientProvider/);
    });

    it('KitClientProvider exposes the provided chain via useChain', () => {
        const { result } = renderHook(() => useChain(), {
            wrapper: ({ children }) => <KitClientProvider chain="solana:devnet">{children}</KitClientProvider>,
        });
        expect(result.current).toBe('solana:devnet');
    });

    it('KitClientProvider accepts an arbitrary wallet-standard IdentifierString (escape hatch)', () => {
        const { result } = renderHook(() => useChain(), {
            wrapper: ({ children }) => <KitClientProvider chain="l2:mainnet">{children}</KitClientProvider>,
        });
        expect(result.current).toBe('l2:mainnet');
    });

    it('KitClientProvider seeds a Kit client with a working `use` method', () => {
        const { result } = renderHook(() => useClient(), {
            wrapper: ({ children }) => <KitClientProvider chain="solana:devnet">{children}</KitClientProvider>,
        });
        expect(typeof result.current.use).toBe('function');
    });

    it('renders children correctly', () => {
        const { container } = render(
            <KitClientProvider chain="solana:mainnet">
                <span>hello</span>
            </KitClientProvider>,
        );
        expect(container.textContent).toBe('hello');
    });

    it('uses the provided client when `client` prop is set', () => {
        const external = createClient();
        const { result } = renderHook(() => useClient(), {
            wrapper: ({ children }) => (
                <KitClientProvider chain="solana:devnet" client={external}>
                    {children}
                </KitClientProvider>
            ),
        });
        expect(result.current).toBe(external);
    });

    it('does not dispose an externally-provided client on unmount', () => {
        // createClient() returns a frozen object, so build a disposable stub
        // we can observe. Only the subset of Client<object> that
        // KitClientProvider reads is needed.
        const externalDispose = vi.fn();
        const external = {
            use: <T extends object>() => external as unknown as Client<T>,
            [Symbol.dispose]: externalDispose,
        } as unknown as Client<object>;

        const { unmount } = render(
            <KitClientProvider chain="solana:devnet" client={external}>
                <span>ok</span>
            </KitClientProvider>,
        );
        unmount();
        expect(externalDispose).not.toHaveBeenCalled();
    });

    it('renders cleanly under StrictMode (double-mount is safe)', () => {
        // React 18 StrictMode runs mount → cleanup → mount a second time
        // in dev. The owned-client path must survive the fake remount
        // without throwing — `disposeClient` is idempotent, so even if the
        // cleanup fires against the same client twice, neither call errors.
        const { unmount } = render(
            <StrictMode>
                <KitClientProvider chain="solana:devnet">
                    <span>ok</span>
                </KitClientProvider>
            </StrictMode>,
        );
        expect(() => unmount()).not.toThrow();
    });
});

describe.skipIf(!__BROWSER__ && !__REACTNATIVE__)('disposeClient', () => {
    it('is idempotent — subsequent calls for the same client are no-ops', () => {
        const dispose = vi.fn();
        const client = { [Symbol.dispose]: dispose } as unknown as object;

        disposeClient(client);
        disposeClient(client);
        disposeClient(client);

        expect(dispose).toHaveBeenCalledTimes(1);
    });

    it('is a no-op for clients without Symbol.dispose', () => {
        const client = {} as object;
        expect(() => disposeClient(client)).not.toThrow();
    });
});
