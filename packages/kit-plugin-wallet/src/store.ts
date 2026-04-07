import type { WalletNamespace, WalletPluginConfig } from './types';

// -- Internal types ---------------------------------------------------------

export type WalletStore = WalletNamespace & {
    [Symbol.dispose]: () => void;
};

// -- Store ------------------------------------------------------------------

/** @internal */
export function createWalletStore(_config: WalletPluginConfig): WalletStore {
    throw new Error('not implemented');
}
