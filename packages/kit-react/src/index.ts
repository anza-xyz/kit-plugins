// Core client + chain context
export { ChainContext, ClientContext, KitClientProvider, useChain, useClient } from './client-context';
export type { ChainIdentifier, KitClientProviderProps } from './client-context';

// Providers
export { PluginProvider } from './providers/plugin-provider';
export type { PluginProviderProps } from './providers/plugin-provider';
export { IdentityProvider, PayerProvider } from './providers/payer-provider';
export type { IdentityProviderProps, PayerProviderProps } from './providers/payer-provider';
export { RpcProvider } from './providers/rpc-provider';
export type { RpcProviderProps } from './providers/rpc-provider';
export { LiteSvmProvider } from './providers/litesvm-provider';
export type { LiteSvmProviderProps } from './providers/litesvm-provider';
export { WalletProvider } from './providers/wallet-provider';
export type { WalletProviderProps, WalletRole } from './providers/wallet-provider';

// Wallet hooks
export { useConnectedWallet, useWallets, useWalletState, useWalletStatus } from './hooks/wallet-state';
export type { ConnectedWallet } from './hooks/wallet-state';
export {
    useConnectWallet,
    useDisconnectWallet,
    useSelectAccount,
    useSignIn,
    useSignMessage,
} from './hooks/wallet-actions';

// Live data hooks
export { useBalance } from './hooks/use-balance';
export { useAccount } from './hooks/use-account';
export { useTransactionConfirmation } from './hooks/use-transaction-confirmation';
export type {
    TransactionConfirmationStatus,
    UseTransactionConfirmationOptions,
} from './hooks/use-transaction-confirmation';
export { useLiveQuery } from './hooks/use-live-query';
export type { UseLiveQueryConfig } from './hooks/use-live-query';
export { useSubscription } from './hooks/use-subscription';
export type { UseSubscriptionResult } from './hooks/use-subscription';
export type { LiveQueryResult } from './internal/live-store';

// Action / transaction hooks
export { useAction } from './hooks/use-action';
export type { ActionState, ActionStatus } from './hooks/use-action';
export { useSendTransaction, useSendTransactions } from './hooks/use-send-transaction';
export type { UseSendTransactionState, UseSendTransactionsState } from './hooks/use-send-transaction';
