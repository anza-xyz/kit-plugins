/**
 * @vitest-environment happy-dom
 */
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useIdentityChurnWarning } from '../src/dev-warnings';

afterEach(() => {
    vi.restoreAllMocks();
});

describe('useIdentityChurnWarning', () => {
    it('warns once the prop has churned three times', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { rerender } = renderHook(
            ({ value }: { value: object }) => {
                useIdentityChurnWarning(value, {
                    propName: 'plugins',
                    providerName: 'TestProvider',
                });
            },
            { initialProps: { value: {} } },
        );
        // First change — silent.
        rerender({ value: {} });
        expect(warn).not.toHaveBeenCalled();
        // Second change — still silent (count=2).
        rerender({ value: {} });
        expect(warn).not.toHaveBeenCalled();
        // Third change — fires.
        rerender({ value: {} });
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0]?.[0]).toMatch(/<TestProvider>.*plugins.*identity/);
    });

    it('does not warn when the same reference is re-rendered', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const stable = { foo: 1 };
        const { rerender } = renderHook(
            ({ value }: { value: object }) => {
                useIdentityChurnWarning(value, {
                    propName: 'plugins',
                    providerName: 'TestProvider',
                });
            },
            { initialProps: { value: stable } },
        );
        rerender({ value: stable });
        rerender({ value: stable });
        rerender({ value: stable });
        expect(warn).not.toHaveBeenCalled();
    });

    it('includes the custom remedy when provided', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { rerender } = renderHook(
            ({ value }: { value: object }) => {
                useIdentityChurnWarning(value, {
                    propName: 'plugins',
                    providerName: 'TestProvider',
                    remedy: 'CUSTOM_REMEDY_TEXT',
                });
            },
            { initialProps: { value: {} } },
        );
        rerender({ value: {} });
        rerender({ value: {} });
        rerender({ value: {} });
        expect(warn.mock.calls[0]?.[0]).toContain('CUSTOM_REMEDY_TEXT');
    });
});
