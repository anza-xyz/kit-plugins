import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { ClientContext, useSubscription } from '../src';
import { stubRpcSubscription } from './_setup-rpc';

function wrap(client: object): (props: { children: ReactNode }) => ReactNode {
    return ({ children }) => <ClientContext.Provider value={client as never}>{children}</ClientContext.Provider>;
}

describe.skipIf(!__BROWSER__ && !__REACTNATIVE__)('useSubscription', () => {
    it('leaves data and error undefined when the factory returns null', () => {
        const client = {} as never;
        const { result } = renderHook(() => useSubscription(() => null, []), { wrapper: wrap(client) });
        expect(result.current).toEqual({ data: undefined, error: undefined });
    });

    it('emits notifications pushed into the stubbed subscription', async () => {
        const sub = stubRpcSubscription<number>();
        const client = {} as never;
        const { result } = renderHook(() => useSubscription(() => sub.request as never, []), { wrapper: wrap(client) });

        expect(result.current.data).toBeUndefined();
        sub.push(1);
        await waitFor(() => expect(result.current.data).toBe(1));
        sub.push(2);
        await waitFor(() => expect(result.current.data).toBe(2));
    });

    it('surfaces an error from the subscription iterator', async () => {
        const sub = stubRpcSubscription<number>();
        const client = {} as never;
        const { result } = renderHook(() => useSubscription(() => sub.request as never, []), { wrapper: wrap(client) });

        const boom = new Error('boom');
        sub.throwError(boom);
        await waitFor(() => expect(result.current.error).toBe(boom));
    });

    it('passes an AbortSignal that aborts on dep change', () => {
        const sub = stubRpcSubscription<number>();
        const signals: AbortSignal[] = [];
        const client = {} as never;
        const factory = (signal: AbortSignal) => {
            signals.push(signal);
            return sub.request as never;
        };
        const { rerender } = renderHook(({ dep }: { dep: number }) => useSubscription(factory, [dep]), {
            initialProps: { dep: 1 },
            wrapper: wrap(client),
        });
        expect(signals[0]?.aborted).toBe(false);

        rerender({ dep: 2 });
        expect(signals[0]?.aborted).toBe(true);
        expect(signals[1]?.aborted).toBe(false);
    });
});
