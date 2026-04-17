// WalletProvider
export { WalletProvider } from './wallet-provider';
export type { WalletProviderProps, WalletRole } from './wallet-provider';

// Wallet state hooks
export { useConnectedWallet, useWallets, useWalletSigner, useWalletState, useWalletStatus } from './hooks/wallet-state';
export type { ConnectedWallet } from './hooks/wallet-state';

// Wallet action hooks
export {
    useConnectWallet,
    useDisconnectWallet,
    useSelectAccount,
    useSignIn,
    useSignMessage,
} from './hooks/wallet-actions';
