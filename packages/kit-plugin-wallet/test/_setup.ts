import { address } from '@solana/kit';
import {
    WALLET_STANDARD_ERROR__FEATURES__WALLET_ACCOUNT_FEATURE_UNIMPLEMENTED,
    WalletStandardError,
} from '@wallet-standard/errors';
import type { UiWallet, UiWalletAccount } from '@wallet-standard/ui';
import { afterEach, beforeEach, vi } from 'vitest';

import type { WalletStorage } from '../src/types';

// -- Mock helpers -----------------------------------------------------------

export function createMockAccount(
    addr = '11111111111111111111111111111111',
    features: readonly string[] = ['solana:signTransaction'],
): UiWalletAccount {
    return {
        address: address(addr),
        chains: ['solana:mainnet'] as const,
        features,
        icon: 'data:image/png;base64,',
        label: 'Account 1',
        publicKey: new Uint8Array(32),
    } as unknown as UiWalletAccount;
}

type MockWalletOptions = {
    accounts?: UiWalletAccount[];
    chains?: string[];
    features?: string[];
    name?: string;
};

export function createMockUiWallet(opts: MockWalletOptions = {}): UiWallet {
    return {
        accounts: opts.accounts ?? [],
        chains: opts.chains ?? ['solana:mainnet'],
        features: opts.features ?? ['standard:connect', 'standard:events'],
        icon: 'data:image/png;base64,',
        name: opts.name ?? 'MockWallet',
        version: '1.0.0',
    } as unknown as UiWallet;
}

export function createMockStorage(initial?: Record<string, string>): WalletStorage {
    const data = new Map<string, string>(initial ? Object.entries(initial) : []);
    return {
        getItem: (key: string) => data.get(key) ?? null,
        removeItem: (key: string) => {
            data.delete(key);
        },
        setItem: (key: string, value: string) => {
            data.set(key, value);
        },
    };
}

// -- Mocks ------------------------------------------------------------------

// Registry mock: tracks registered wallets and event handlers.
export const registeredWallets: ReturnType<typeof createMockRawWallet>[] = [];
export const registryListeners: Record<string, Array<(...args: unknown[]) => void>> = {
    register: [],
    unregister: [],
};

function createMockRawWallet(uiWallet: UiWallet) {
    return {
        accounts: [...uiWallet.accounts],
        chains: [...uiWallet.chains],
        features: Object.fromEntries(uiWallet.features.map(f => [f, { version: '1.0.0' }])),
        icon: uiWallet.icon,
        name: uiWallet.name,
        version: uiWallet.version,
    };
}

vi.mock('@wallet-standard/app', () => ({
    getWallets: () => ({
        get: () => registeredWallets,
        on: (event: string, listener: (...args: unknown[]) => void) => {
            registryListeners[event]?.push(listener);
            // Return an unsubscribe function that removes this listener.
            return () => {
                const list = registryListeners[event];
                if (list) {
                    const idx = list.indexOf(listener);
                    if (idx >= 0) list.splice(idx, 1);
                }
            };
        },
    }),
}));

// Map raw wallets to UiWallets. refreshUiWallet round-trips through this:
// getWalletForHandle returns the raw wallet, getOrCreateUiWallet maps it
// back to the latest UiWallet. Calling registerWallet with the same name
// updates the mapping, so refreshUiWallet returns the updated wallet.
const rawToUi = new Map<object, UiWallet>();
const nameToRaw = new Map<string, object>();
// Maps each account handle (by object identity) to its owning raw wallet, so
// the `getWalletForHandle` mock resolves account handles the way the real
// registry's WeakMap does. Populated by registerWallet / updateRegisteredWallet.
const accountToRaw = new WeakMap<object, object>();

vi.mock('@wallet-standard/ui-registry', () => ({
    getOrCreateUiWalletForStandardWallet: (raw: object) => {
        const ui = rawToUi.get(raw);
        if (!ui) throw new Error('No UiWallet registered for this raw wallet');
        return ui;
    },
    getWalletForHandle: (handle: UiWallet | UiWalletAccount) => {
        // Account handle? Resolve by object identity, like the real WeakMap registry.
        const rawFromAccount = accountToRaw.get(handle as unknown as object);
        if (rawFromAccount) return rawFromAccount;
        // Otherwise it's a wallet handle — resolve the latest raw wallet by name.
        const raw = nameToRaw.get((handle as UiWallet).name);
        if (!raw) throw new Error(`No raw wallet registered for "${(handle as UiWallet).name}"`);
        return raw;
    },
}));

// Track the connect/disconnect/events mocks per wallet.
export let connectMock = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
export let disconnectMock = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
export let signInMock: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue([{}]);
export let signMessageMock: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue([{ signature: new Uint8Array(64) }]);
export let eventListenerCleanup: ReturnType<typeof vi.fn<() => void>> = vi.fn<() => void>();

// Active `standard:events` change handlers, keyed by wallet name. The store
// subscribes to *every* discovered wallet, so a single slot can't represent
// them; tests fire a specific wallet's handler via `emitWalletChange` and check
// whether a wallet is subscribed via `walletEventHandlers.has(name)`.
export const walletEventHandlers = new Map<string, (props: Record<string, unknown>) => void>();
export function emitWalletChange(name: string, props: Record<string, unknown>): void {
    walletEventHandlers.get(name)?.(props);
}

type IdentifierString = `${string}:${string}`;

function resolveFeatureImpl(feature: IdentifierString, walletName?: string): unknown {
    if (feature === 'standard:connect') {
        return { connect: connectMock, version: '1.0.0' };
    }
    if (feature === 'standard:disconnect') {
        return { disconnect: disconnectMock, version: '1.0.0' };
    }
    if (feature === 'standard:events') {
        return {
            on: (_event: string, handler: (properties: Record<string, unknown>) => void) => {
                if (walletName) walletEventHandlers.set(walletName, handler);
                return () => {
                    if (walletName) walletEventHandlers.delete(walletName);
                    eventListenerCleanup();
                };
            },
            version: '1.0.0',
        };
    }
    if (feature === 'solana:signIn') {
        return { signIn: signInMock, version: '1.0.0' };
    }
    if (feature === 'solana:signMessage') {
        return { signMessage: signMessageMock, version: '1.0.0' };
    }
    throw new Error(`Feature ${feature} not supported`);
}

vi.mock('@wallet-standard/ui-features', () => ({
    // Mirrors the real `getWalletAccountFeature`: it first checks the account's
    // own feature list, throwing a `WalletStandardError` when the account
    // doesn't support the feature, then resolves the wallet-level
    // implementation.
    getWalletAccountFeature: (account: UiWalletAccount, feature: IdentifierString) => {
        if (!account.features.includes(feature)) {
            throw new WalletStandardError(WALLET_STANDARD_ERROR__FEATURES__WALLET_ACCOUNT_FEATURE_UNIMPLEMENTED, {
                address: account.address,
                featureName: feature,
                supportedChains: [...account.chains],
                supportedFeatures: [...account.features],
            });
        }
        return resolveFeatureImpl(feature);
    },
    getWalletFeature: (wallet: UiWallet, feature: IdentifierString) => {
        if (!wallet.features.includes(feature)) {
            throw new Error(`Wallet "${wallet.name}" does not support ${feature}`);
        }
        return resolveFeatureImpl(feature, wallet.name);
    },
}));

// Signer mock.
export const mockSignerAddress = address('11111111111111111111111111111111');
export const mockSigner: { address: typeof mockSignerAddress; modifyAndSignTransactions: ReturnType<typeof vi.fn> } = {
    address: mockSignerAddress,
    modifyAndSignTransactions: vi.fn(),
};

export let createSignerMock = vi.fn<(...args: unknown[]) => unknown>().mockReturnValue(mockSigner);

vi.mock('@solana/wallet-account-signer', () => ({
    createSignerFromWalletAccount: (...args: unknown[]) => createSignerMock(...args),
}));

// -- Helpers ----------------------------------------------------------------

export function registerWallet(uiWallet: UiWallet): void {
    const raw = createMockRawWallet(uiWallet);
    rawToUi.set(raw, uiWallet);
    nameToRaw.set(uiWallet.name, raw);
    for (const account of uiWallet.accounts) {
        accountToRaw.set(account as unknown as object, raw);
    }
    registeredWallets.push(raw);
}

/** Update an already-registered wallet's UiWallet mapping (for event handler tests). */
export function updateRegisteredWallet(uiWallet: UiWallet): void {
    const raw = nameToRaw.get(uiWallet.name);
    if (raw) {
        rawToUi.set(raw, uiWallet);
        for (const account of uiWallet.accounts) {
            accountToRaw.set(account as unknown as object, raw);
        }
    }
}

/** Simulate a wallet registering after store creation (for late-registration tests). */
export function lateRegisterWallet(uiWallet: UiWallet): void {
    registerWallet(uiWallet);
    registryListeners.register.forEach(l => l());
}

/** Simulate a wallet being unregistered (removed from registry). */
export function unregisterWallet(uiWallet: UiWallet): void {
    const raw = nameToRaw.get(uiWallet.name);
    if (raw) {
        const idx = registeredWallets.indexOf(raw as (typeof registeredWallets)[number]);
        if (idx >= 0) registeredWallets.splice(idx, 1);
        // Intentionally leave `rawToUi`/`nameToRaw` intact. The real
        // `@wallet-standard/ui-registry` resolves handles by object identity,
        // so `getWalletForHandle`/`getOrCreateUiWalletForStandardWallet` keep
        // working for an unregistered wallet — only the registry's `get()`
        // list drops it.
    }
    registryListeners.unregister.forEach(l => l());
}

function clearRegistry(): void {
    registeredWallets.length = 0;
    rawToUi.clear();
    nameToRaw.clear();
    registryListeners.register = [];
    registryListeners.unregister = [];
    walletEventHandlers.clear();
}

// -- Lifecycle --------------------------------------------------------------

beforeEach(() => {
    clearRegistry();
    connectMock = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    disconnectMock = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    signInMock = vi.fn().mockResolvedValue([{}]);
    signMessageMock = vi.fn().mockResolvedValue([{ signature: new Uint8Array(64) }]);
    createSignerMock = vi.fn<(...args: unknown[]) => unknown>().mockReturnValue(mockSigner);
    eventListenerCleanup = vi.fn<() => void>();
});

afterEach(() => {
    vi.restoreAllMocks();
});
