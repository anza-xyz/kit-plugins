import { KitClientProvider } from '@solana/kit-react';
import { render } from '@testing-library/react';
import type { UiWallet } from '@wallet-standard/ui';
import { describe, expect, it, vi } from 'vitest';

import { WalletProvider } from '../src';

// Hoisted to module scope — stable identity across renders.
const stableFilter = (_w: UiWallet) => true;

describe.skipIf(!__BROWSER__ && !__REACTNATIVE__)('WalletProvider — prop-churn warning', () => {
    it('warns when `filter` identity changes across renders', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const { rerender } = render(
                <KitClientProvider chain="solana:devnet">
                    <WalletProvider filter={() => true}>
                        <span>ok</span>
                    </WalletProvider>
                </KitClientProvider>,
            );
            // Re-render repeatedly with a fresh `filter` each time.
            for (let i = 0; i < 3; i++) {
                rerender(
                    <KitClientProvider chain="solana:devnet">
                        <WalletProvider filter={() => true}>
                            <span>ok</span>
                        </WalletProvider>
                    </KitClientProvider>,
                );
            }
            const filterWarning = warn.mock.calls.find(call => /prop identity for `filter`/.test(call[0] as string));
            expect(filterWarning).toBeTruthy();
        } finally {
            warn.mockRestore();
        }
    });

    it('does not warn when `filter` identity is stable', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const { rerender } = render(
                <KitClientProvider chain="solana:devnet">
                    <WalletProvider filter={stableFilter}>
                        <span>ok</span>
                    </WalletProvider>
                </KitClientProvider>,
            );
            for (let i = 0; i < 5; i++) {
                rerender(
                    <KitClientProvider chain="solana:devnet">
                        <WalletProvider filter={stableFilter}>
                            <span>ok</span>
                        </WalletProvider>
                    </KitClientProvider>,
                );
            }
            const filterWarning = warn.mock.calls.find(call => /prop identity for `filter`/.test(call[0] as string));
            expect(filterWarning).toBeFalsy();
        } finally {
            warn.mockRestore();
        }
    });
});
