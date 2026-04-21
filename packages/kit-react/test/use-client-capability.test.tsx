import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { ClientContext, useClientCapability } from '../src';

function wrap(client: object): (props: { children: ReactNode }) => ReactNode {
    return ({ children }) => <ClientContext.Provider value={client as never}>{children}</ClientContext.Provider>;
}

describe.skipIf(!__BROWSER__ && !__REACTNATIVE__)('useClientCapability', () => {
    it('returns the client when the capability is present', () => {
        const client = { foo: { getThing: () => 'ok' } } as never;
        const { result } = renderHook(
            () =>
                useClientCapability<{ foo: { getThing: () => string } }>({
                    capability: 'foo',
                    hookName: 'useFoo',
                    providerHint: 'Usually supplied by <FooProvider>.',
                }),
            { wrapper: wrap(client) },
        );
        expect(result.current.foo.getThing()).toBe('ok');
    });

    it('throws a formatted capability error for a single missing key', () => {
        const client = {} as never;
        expect(() =>
            renderHook(
                () =>
                    useClientCapability({
                        capability: 'foo',
                        hookName: 'useFoo',
                        providerHint: 'Usually supplied by <FooProvider>.',
                    }),
                { wrapper: wrap(client) },
            ),
        ).toThrow(/useFoo\(\) requires `client\.foo`\. Usually supplied by <FooProvider>\./);
    });

    it('throws a formatted error listing two missing keys', () => {
        const client = {} as never;
        expect(() =>
            renderHook(
                () =>
                    useClientCapability({
                        capability: ['foo', 'bar'],
                        hookName: 'useBoth',
                        providerHint: 'Usually supplied by <BothProvider>.',
                    }),
                { wrapper: wrap(client) },
            ),
        ).toThrow(/useBoth\(\) requires `client\.foo` and `client\.bar`\. Usually supplied by <BothProvider>\./);
    });

    it('throws listing three-plus missing keys with an Oxford comma', () => {
        const client = {} as never;
        expect(() =>
            renderHook(
                () =>
                    useClientCapability({
                        capability: ['a', 'b', 'c'],
                        hookName: 'useAll',
                        providerHint: 'Usually supplied by <AllProvider>.',
                    }),
                { wrapper: wrap(client) },
            ),
        ).toThrow(/useAll\(\) requires `client\.a`, `client\.b`, and `client\.c`/);
    });

    it('throws a missing-provider error when no KitClientProvider is mounted', () => {
        expect(() =>
            renderHook(() =>
                useClientCapability({
                    capability: 'foo',
                    hookName: 'useFoo',
                    providerHint: 'Usually supplied by <FooProvider>.',
                }),
            ),
        ).toThrow(/KitClientProvider/);
    });
});
