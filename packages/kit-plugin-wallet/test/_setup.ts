import { address } from '@solana/kit';
import type { UiWallet, UiWalletAccount } from '@wallet-standard/ui';
import { afterEach, beforeEach, vi } from 'vitest';

import type { WalletStorage } from '../src/types';

// -- Mock helpers -----------------------------------------------------------

export function createMockAccount(addr = '11111111111111111111111111111111'): UiWalletAccount {
    return {
        address: address(addr),
        chains: ['solana:mainnet'] as const,
        features: ['solana:signTransaction'] as const,
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

vi.mock('@wallet-standard/ui-registry', () => ({
    getOrCreateUiWalletForStandardWallet_DO_NOT_USE_OR_YOU_WILL_BE_FIRED: (raw: object) => {
        const ui = rawToUi.get(raw);
        if (!ui) throw new Error('No UiWallet registered for this raw wallet');
        return ui;
    },
    getWalletForHandle_DO_NOT_USE_OR_YOU_WILL_BE_FIRED: (ui: UiWallet) => {
        // Return the latest raw wallet for this name, so refreshUiWallet
        // picks up updated registrations.
        const raw = nameToRaw.get(ui.name);
        if (!raw) throw new Error(`No raw wallet registered for "${ui.name}"`);
        return raw;
    },
}));

// Track the connect/disconnect/events mocks per wallet.
export let connectMock = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
export let disconnectMock = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
export let signInMock: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue([{}]);
export let signMessageMock: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue([{ signature: new Uint8Array(64) }]);
export let eventListenerCleanup: ReturnType<typeof vi.fn> = vi.fn();

// Captured wallet event handler — tests call this to simulate wallet change events.
export let walletEventHandler: ((properties: Record<string, unknown>) => void) | null = null;

type IdentifierString = `${string}:${string}`;

vi.mock('@wallet-standard/ui-features', () => ({
    getWalletFeature: (wallet: UiWallet, feature: IdentifierString) => {
        if (!wallet.features.includes(feature)) {
            throw new Error(`Wallet "${wallet.name}" does not support ${feature}`);
        }
        if (feature === 'standard:connect') {
            return { connect: connectMock, version: '1.0.0' };
        }
        if (feature === 'standard:disconnect') {
            return { disconnect: disconnectMock, version: '1.0.0' };
        }
        if (feature === 'standard:events') {
            return {
                on: (_event: string, handler: (properties: Record<string, unknown>) => void) => {
                    walletEventHandler = handler;
                    return eventListenerCleanup;
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
    registeredWallets.push(raw);
}

/** Update an already-registered wallet's UiWallet mapping (for event handler tests). */
export function updateRegisteredWallet(uiWallet: UiWallet): void {
    const raw = nameToRaw.get(uiWallet.name);
    if (raw) {
        rawToUi.set(raw, uiWallet);
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
        rawToUi.delete(raw);
        nameToRaw.delete(uiWallet.name);
    }
    registryListeners.unregister.forEach(l => l());
}

function clearRegistry(): void {
    registeredWallets.length = 0;
    rawToUi.clear();
    nameToRaw.clear();
    registryListeners.register = [];
    registryListeners.unregister = [];
}

// -- Lifecycle --------------------------------------------------------------

beforeEach(() => {
    clearRegistry();
    connectMock = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    disconnectMock = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    signInMock = vi.fn().mockResolvedValue([{}]);
    signMessageMock = vi.fn().mockResolvedValue([{ signature: new Uint8Array(64) }]);
    createSignerMock = vi.fn<(...args: unknown[]) => unknown>().mockReturnValue(mockSigner);
    eventListenerCleanup = vi.fn();
    walletEventHandler = null;
});

afterEach(() => {
    vi.restoreAllMocks();
});
