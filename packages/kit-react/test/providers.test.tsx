import { type TransactionSigner } from '@solana/kit';
import { render, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { IdentityProvider, KitClientProvider, PayerProvider, PluginProvider, RpcProvider, useClient } from '../src';

const fakeSigner = { address: '11111111111111111111111111111111' } as unknown as TransactionSigner;

function RootWrap({ children }: { children: React.ReactNode }) {
    return <KitClientProvider chain="solana:devnet">{children}</KitClientProvider>;
}

describe.skipIf(!__BROWSER__ && !__REACTNATIVE__)('providers', () => {
    it('PayerProvider sets client.payer', () => {
        const { result } = renderHook(() => useClient<{ payer: TransactionSigner }>(), {
            wrapper: ({ children }) => (
                <RootWrap>
                    <PayerProvider signer={fakeSigner}>{children}</PayerProvider>
                </RootWrap>
            ),
        });
        expect(result.current.payer).toBe(fakeSigner);
    });

    it('IdentityProvider sets client.identity', () => {
        const { result } = renderHook(() => useClient<{ identity: TransactionSigner }>(), {
            wrapper: ({ children }) => (
                <RootWrap>
                    <IdentityProvider signer={fakeSigner}>{children}</IdentityProvider>
                </RootWrap>
            ),
        });
        expect(result.current.identity).toBe(fakeSigner);
    });

    it('RpcProvider throws when no payer is present', () => {
        // Silence the React error boundary console spam for this throw test.
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        try {
            expect(() =>
                render(
                    <RootWrap>
                        <RpcProvider rpcUrl="https://api.devnet.solana.com">
                            <span>x</span>
                        </RpcProvider>
                    </RootWrap>,
                ),
            ).toThrow(/RpcProvider requires a payer/);
        } finally {
            spy.mockRestore();
        }
    });

    it('PluginProvider applies a plugin', () => {
        const plugin = (client: object) => ({ ...client, customField: 'yes' });
        const { result } = renderHook(() => useClient<{ customField: string }>(), {
            wrapper: ({ children }) => (
                <RootWrap>
                    <PluginProvider plugin={plugin}>{children}</PluginProvider>
                </RootWrap>
            ),
        });
        expect(result.current.customField).toBe('yes');
    });

    it('PluginProvider applies multiple plugins in order', () => {
        const p1 = (c: object) => ({ ...c, a: 1 });
        const p2 = (c: object) => ({ ...c, b: 2 });
        const { result } = renderHook(() => useClient<{ a: number; b: number }>(), {
            wrapper: ({ children }) => (
                <RootWrap>
                    <PluginProvider plugins={[p1, p2]}>{children}</PluginProvider>
                </RootWrap>
            ),
        });
        expect(result.current.a).toBe(1);
        expect(result.current.b).toBe(2);
    });

    it('PluginProvider warns in dev when plugin identity churns across renders', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const { rerender } = render(
                <RootWrap>
                    <PluginProvider plugin={(c: object) => ({ ...c, n: 0 })}>
                        <span>ok</span>
                    </PluginProvider>
                </RootWrap>,
            );
            // Re-render repeatedly with a fresh plugin each time to simulate
            // a caller that forgot to memoize.
            for (let i = 1; i <= 3; i++) {
                rerender(
                    <RootWrap>
                        <PluginProvider plugin={(c: object) => ({ ...c, n: i })}>
                            <span>ok</span>
                        </PluginProvider>
                    </RootWrap>,
                );
            }
            expect(warn).toHaveBeenCalledTimes(1);
            expect(warn.mock.calls[0]?.[0]).toMatch(/plugin identity is changing/);
        } finally {
            warn.mockRestore();
        }
    });

    it('PluginProvider does not warn when the plugin reference is stable', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const stable = (c: object) => ({ ...c, n: 1 });
            const { rerender } = render(
                <RootWrap>
                    <PluginProvider plugin={stable}>
                        <span>ok</span>
                    </PluginProvider>
                </RootWrap>,
            );
            for (let i = 0; i < 5; i++) {
                rerender(
                    <RootWrap>
                        <PluginProvider plugin={stable}>
                            <span>ok</span>
                        </PluginProvider>
                    </RootWrap>,
                );
            }
            expect(warn).not.toHaveBeenCalled();
        } finally {
            warn.mockRestore();
        }
    });
});
