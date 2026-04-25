/**
 * @vitest-environment happy-dom
 */
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useClientCapability } from '../src/client-capability';
import { expectingError, Providers } from './helpers';

describe('useClientCapability', () => {
    it('returns the client when the capability is installed', () => {
        const wrapper = ({ children }: { children: React.ReactNode }) => (
            <Providers extensions={{ rpc: { send: () => {} } }}>{children}</Providers>
        );
        const { result } = renderHook(
            () =>
                useClientCapability<{ rpc: { send: () => void } }>({
                    capability: 'rpc',
                    hookName: 'useFakeHook',
                    providerHint: 'Install `solanaRpc()` on the client.',
                }),
            { wrapper },
        );
        expect(result.current.rpc).toBeDefined();
    });

    it('throws a helpful error when the capability is missing', () => {
        const wrapper = ({ children }: { children: React.ReactNode }) => <Providers>{children}</Providers>;
        expectingError(() => {
            expect(() =>
                renderHook(
                    () =>
                        useClientCapability({
                            capability: 'rpc',
                            hookName: 'useFakeHook',
                            providerHint: 'Install `solanaRpc()` on the client.',
                        }),
                    { wrapper },
                ),
            ).toThrow(/useFakeHook.*client\.rpc.*solanaRpc/s);
        });
    });

    it('accepts an array of capabilities and lists them all in the error', () => {
        const wrapper = ({ children }: { children: React.ReactNode }) => (
            <Providers extensions={{ rpc: {} }}>{children}</Providers>
        );
        expectingError(() => {
            expect(() =>
                renderHook(
                    () =>
                        useClientCapability({
                            capability: ['rpc', 'rpcSubscriptions'],
                            hookName: 'useFakeHook',
                            providerHint: 'Install both.',
                        }),
                    { wrapper },
                ),
            ).toThrow(/all of.*client\.rpc.*client\.rpcSubscriptions/s);
        });
    });
});
