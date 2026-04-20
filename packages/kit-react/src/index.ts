// Core client + chain context
export { ChainContext, ClientContext, KitClientProvider, useChain, useClient } from './client-context';
export type { ChainIdentifier, KitClientProviderProps } from './client-context';

// Runtime-checked capability narrowing (third-party hook helper)
export { useClientCapability } from './client-capability';
export type { UseClientCapabilityOptions } from './client-capability';

// Dev-mode prop-identity churn warning (shared by every provider; reusable by third-party providers)
export { useIdentityChurnWarning } from './dev-warnings';
export type { UseIdentityChurnWarningOptions } from './dev-warnings';

// Providers
export { PluginProvider } from './providers/plugin-provider';
export type { PluginProviderProps } from './providers/plugin-provider';
export { IdentityProvider, PayerProvider } from './providers/payer-provider';
export type { IdentityProviderProps, PayerProviderProps } from './providers/payer-provider';
export { RpcProvider } from './providers/rpc-provider';
export type { RpcProviderProps } from './providers/rpc-provider';
export { RpcReadOnlyProvider } from './providers/rpc-read-only-provider';
export type { RpcReadOnlyProviderProps } from './providers/rpc-read-only-provider';
export { LiteSvmProvider } from './providers/litesvm-provider';
export type { LiteSvmProviderProps } from './providers/litesvm-provider';

// Signer hooks
export { useIdentity, usePayer } from './hooks/signers';

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
export { usePlanTransaction, usePlanTransactions } from './hooks/use-plan-transaction';
export type { UsePlanTransactionState, UsePlanTransactionsState } from './hooks/use-plan-transaction';
