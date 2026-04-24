/**
 * @vitest-environment happy-dom
 */
import type { Address, TransactionSigner } from '@solana/kit';
import { address } from '@solana/kit';
import { render, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { ChainProvider, KitClientProvider, useChain, useClient } from '../src/client-context';
import { LiteSvmProvider } from '../src/providers/litesvm-provider';
import { PluginProvider } from '../src/providers/plugin-provider';
import { RpcConnectionProvider } from '../src/providers/rpc-connection-provider';
import {
    RpcProvider,
    SolanaDevnetRpcProvider,
    SolanaLocalRpcProvider,
    SolanaMainnetRpcProvider,
} from '../src/providers/rpc-provider';
import { IdentityProvider, PayerProvider, SignerProvider } from '../src/providers/signer-provider';
import { expectingError, mockPlugin } from './helpers';

const FAKE_ADDRESS: Address = address('11111111111111111111111111111111');

function fakeSigner(): TransactionSigner {
    return {
        address: FAKE_ADDRESS,
        signAndSendTransactions: async () => [],
    } as unknown as TransactionSigner;
}

const RPC_URL = 'http://127.0.0.1:8899';
const RPC_SUBS_URL = 'ws://127.0.0.1:8900';

describe('PluginProvider', () => {
    it('installs plugins in order and stacks their extensions', () => {
        function wrapper({ children }: { children: ReactNode }) {
            return (
                <KitClientProvider>
                    <PluginProvider plugins={[mockPlugin({ a: 1 }), mockPlugin({ b: 2 })]}>{children}</PluginProvider>
                </KitClientProvider>
            );
        }
        const { result } = renderHook(() => useClient<{ a: number; b: number }>(), { wrapper });
        expect(result.current.a).toBe(1);
        expect(result.current.b).toBe(2);
    });

    it('throws when mounted outside a KitClientProvider', () => {
        function wrapper({ children }: { children: ReactNode }) {
            return <PluginProvider plugins={[]}>{children}</PluginProvider>;
        }
        expectingError(() => {
            expect(() => renderHook(() => useClient(), { wrapper })).toThrow(
                /must be called inside a <KitClientProvider>/,
            );
        });
    });
});

describe('PayerProvider / IdentityProvider / SignerProvider', () => {
    it('PayerProvider installs client.payer', () => {
        const mySigner = fakeSigner();
        function wrapper({ children }: { children: ReactNode }) {
            return (
                <KitClientProvider>
                    <PayerProvider payer={mySigner}>{children}</PayerProvider>
                </KitClientProvider>
            );
        }
        const { result } = renderHook(() => useClient<{ payer: TransactionSigner }>(), { wrapper });
        expect(result.current.payer).toBe(mySigner);
    });

    it('IdentityProvider installs client.identity', () => {
        const mySigner = fakeSigner();
        function wrapper({ children }: { children: ReactNode }) {
            return (
                <KitClientProvider>
                    <IdentityProvider identity={mySigner}>{children}</IdentityProvider>
                </KitClientProvider>
            );
        }
        const { result } = renderHook(() => useClient<{ identity: TransactionSigner }>(), { wrapper });
        expect(result.current.identity).toBe(mySigner);
    });

    it('SignerProvider installs both payer and identity', () => {
        const mySigner = fakeSigner();
        function wrapper({ children }: { children: ReactNode }) {
            return (
                <KitClientProvider>
                    <SignerProvider signer={mySigner}>{children}</SignerProvider>
                </KitClientProvider>
            );
        }
        const { result } = renderHook(() => useClient<{ identity: TransactionSigner; payer: TransactionSigner }>(), {
            wrapper,
        });
        expect(result.current.payer).toBe(mySigner);
        expect(result.current.identity).toBe(mySigner);
    });
});

describe('RpcConnectionProvider', () => {
    it('installs client.rpc and client.rpcSubscriptions', () => {
        function wrapper({ children }: { children: ReactNode }) {
            return (
                <KitClientProvider>
                    <RpcConnectionProvider rpcUrl={RPC_URL} rpcSubscriptionsUrl={RPC_SUBS_URL}>
                        {children}
                    </RpcConnectionProvider>
                </KitClientProvider>
            );
        }
        const { result } = renderHook(() => useClient<{ rpc: unknown; rpcSubscriptions: unknown }>(), { wrapper });
        expect(result.current.rpc).toBeDefined();
        expect(result.current.rpcSubscriptions).toBeDefined();
    });

    it('publishes chain when passed as a prop', () => {
        function wrapper({ children }: { children: ReactNode }) {
            return (
                <KitClientProvider>
                    <RpcConnectionProvider rpcUrl={RPC_URL} chain="solana:devnet">
                        {children}
                    </RpcConnectionProvider>
                </KitClientProvider>
            );
        }
        const { result } = renderHook(() => useChain(), { wrapper });
        expect(result.current).toBe('solana:devnet');
    });

    it('does not publish chain when prop is omitted', () => {
        function wrapper({ children }: { children: ReactNode }) {
            return (
                <KitClientProvider>
                    <RpcConnectionProvider rpcUrl={RPC_URL}>{children}</RpcConnectionProvider>
                </KitClientProvider>
            );
        }
        expectingError(() => {
            expect(() => renderHook(() => useChain(), { wrapper })).toThrow(/requires a chain/);
        });
    });
});

describe('RpcProvider', () => {
    it('installs full stack when a payer is present', () => {
        const mySigner = fakeSigner();
        function wrapper({ children }: { children: ReactNode }) {
            return (
                <KitClientProvider>
                    <PayerProvider payer={mySigner}>
                        <RpcProvider rpcUrl={RPC_URL} rpcSubscriptionsUrl={RPC_SUBS_URL}>
                            {children}
                        </RpcProvider>
                    </PayerProvider>
                </KitClientProvider>
            );
        }
        const { result } = renderHook(
            () => useClient<{ planTransaction: unknown; rpc: unknown; sendTransaction: unknown }>(),
            { wrapper },
        );
        expect(result.current.rpc).toBeDefined();
        expect(result.current.sendTransaction).toBeDefined();
        expect(result.current.planTransaction).toBeDefined();
    });

    it('throws when no payer is installed', () => {
        function wrapper({ children }: { children: ReactNode }) {
            return (
                <KitClientProvider>
                    <RpcProvider rpcUrl={RPC_URL}>{children}</RpcProvider>
                </KitClientProvider>
            );
        }
        expectingError(() => {
            expect(() => renderHook(() => useClient(), { wrapper })).toThrow(/requires a payer/);
        });
    });

    it('publishes chain when passed as a prop', () => {
        const mySigner = fakeSigner();
        function wrapper({ children }: { children: ReactNode }) {
            return (
                <KitClientProvider>
                    <PayerProvider payer={mySigner}>
                        <RpcProvider rpcUrl={RPC_URL} chain="solana:mainnet">
                            {children}
                        </RpcProvider>
                    </PayerProvider>
                </KitClientProvider>
            );
        }
        const { result } = renderHook(() => useChain(), { wrapper });
        expect(result.current).toBe('solana:mainnet');
    });
});

describe('chain-specific RPC providers', () => {
    const mySigner = fakeSigner();

    it('SolanaMainnetRpcProvider publishes solana:mainnet', () => {
        function wrapper({ children }: { children: ReactNode }) {
            return (
                <KitClientProvider>
                    <PayerProvider payer={mySigner}>
                        <SolanaMainnetRpcProvider rpcUrl="https://api.mainnet-beta.solana.com">
                            {children}
                        </SolanaMainnetRpcProvider>
                    </PayerProvider>
                </KitClientProvider>
            );
        }
        const { result } = renderHook(() => useChain(), { wrapper });
        expect(result.current).toBe('solana:mainnet');
    });

    it('SolanaDevnetRpcProvider publishes solana:devnet and installs airdrop', () => {
        function wrapper({ children }: { children: ReactNode }) {
            return (
                <KitClientProvider>
                    <PayerProvider payer={mySigner}>
                        <SolanaDevnetRpcProvider>{children}</SolanaDevnetRpcProvider>
                    </PayerProvider>
                </KitClientProvider>
            );
        }
        const { result } = renderHook(
            () => ({
                airdrop: useClient<{ airdrop?: unknown }>().airdrop,
                chain: useChain(),
            }),
            { wrapper },
        );
        expect(result.current.chain).toBe('solana:devnet');
        expect(result.current.airdrop).toBeDefined();
    });

    it('SolanaLocalRpcProvider installs airdrop but does not publish a chain by default', () => {
        function wrapper({ children }: { children: ReactNode }) {
            return (
                <KitClientProvider>
                    <PayerProvider payer={mySigner}>
                        <SolanaLocalRpcProvider>{children}</SolanaLocalRpcProvider>
                    </PayerProvider>
                </KitClientProvider>
            );
        }
        const { result } = renderHook(() => useClient<{ airdrop?: unknown }>().airdrop, { wrapper });
        expect(result.current).toBeDefined();
        // No chain published — useChain should throw.
        expectingError(() => {
            expect(() => renderHook(() => useChain(), { wrapper })).toThrow(/requires a chain/);
        });
    });

    it('SolanaLocalRpcProvider publishes chain when passed explicitly', () => {
        function wrapper({ children }: { children: ReactNode }) {
            return (
                <KitClientProvider>
                    <PayerProvider payer={mySigner}>
                        <SolanaLocalRpcProvider chain="solana:devnet">{children}</SolanaLocalRpcProvider>
                    </PayerProvider>
                </KitClientProvider>
            );
        }
        const { result } = renderHook(() => useChain(), { wrapper });
        expect(result.current).toBe('solana:devnet');
    });

    it('chain-specific RPC providers throw without a payer', () => {
        function wrapper({ children }: { children: ReactNode }) {
            return (
                <KitClientProvider>
                    <SolanaMainnetRpcProvider rpcUrl="https://api.mainnet-beta.solana.com">
                        {children}
                    </SolanaMainnetRpcProvider>
                </KitClientProvider>
            );
        }
        expectingError(() => {
            expect(() => renderHook(() => useClient(), { wrapper })).toThrow(/requires a payer/);
        });
    });
});

// LiteSVM is a Node-only plugin — gate this block so browser and react-native projects skip it.
describe.skipIf(!__NODEJS__)('LiteSvmProvider', () => {
    it('installs a LiteSVM-backed client when a payer is present', () => {
        const mySigner = fakeSigner();
        function wrapper({ children }: { children: ReactNode }) {
            return (
                <KitClientProvider>
                    <PayerProvider payer={mySigner}>
                        <LiteSvmProvider>{children}</LiteSvmProvider>
                    </PayerProvider>
                </KitClientProvider>
            );
        }
        const { result } = renderHook(
            () => useClient<{ planTransaction: unknown; sendTransaction: unknown; svm: unknown }>(),
            { wrapper },
        );
        expect(result.current.svm).toBeDefined();
        expect(result.current.sendTransaction).toBeDefined();
        expect(result.current.planTransaction).toBeDefined();
    });

    it('throws when no payer is installed', () => {
        function wrapper({ children }: { children: ReactNode }) {
            return (
                <KitClientProvider>
                    <LiteSvmProvider>{children}</LiteSvmProvider>
                </KitClientProvider>
            );
        }
        expectingError(() => {
            expect(() => renderHook(() => useClient(), { wrapper })).toThrow(/requires a payer/);
        });
    });
});

describe('ChainProvider overrides', () => {
    it('overrides an ancestor-provided chain', () => {
        function wrapper({ children }: { children: ReactNode }) {
            return (
                <KitClientProvider>
                    <ChainProvider chain="solana:mainnet">
                        <ChainProvider chain="solana:devnet">{children}</ChainProvider>
                    </ChainProvider>
                </KitClientProvider>
            );
        }
        const { result } = renderHook(() => useChain(), { wrapper });
        expect(result.current).toBe('solana:devnet');
    });
});

describe('providers rebuild on prop changes', () => {
    it('SignerProvider swaps client.payer when the signer prop changes', () => {
        const first = fakeSigner();
        const second = {
            ...fakeSigner(),
            address: address('So11111111111111111111111111111111111111112'),
        } as TransactionSigner;
        let lastPayer: TransactionSigner | undefined;
        function Probe() {
            lastPayer = useClient<{ payer: TransactionSigner }>().payer;
            return null;
        }
        const { rerender } = render(
            <KitClientProvider>
                <SignerProvider signer={first}>
                    <Probe />
                </SignerProvider>
            </KitClientProvider>,
        );
        expect(lastPayer).toBe(first);
        rerender(
            <KitClientProvider>
                <SignerProvider signer={second}>
                    <Probe />
                </SignerProvider>
            </KitClientProvider>,
        );
        expect(lastPayer).toBe(second);
    });

    it('RpcConnectionProvider rebuilds the client when rpcUrl changes', () => {
        let lastRpc: unknown;
        function Probe() {
            lastRpc = useClient<{ rpc: unknown }>().rpc;
            return null;
        }
        const { rerender } = render(
            <KitClientProvider>
                <RpcConnectionProvider rpcUrl={RPC_URL}>
                    <Probe />
                </RpcConnectionProvider>
            </KitClientProvider>,
        );
        const firstRpc = lastRpc;
        expect(firstRpc).toBeDefined();
        rerender(
            <KitClientProvider>
                <RpcConnectionProvider rpcUrl="http://127.0.0.1:9988">
                    <Probe />
                </RpcConnectionProvider>
            </KitClientProvider>,
        );
        expect(lastRpc).toBeDefined();
        expect(lastRpc).not.toBe(firstRpc); // new client created on URL change
    });
});
