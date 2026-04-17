import { render, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { KitClientProvider, useChain, useClient } from '../src';

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
});
