// Client + chain context
export {
    ChainContext,
    ChainProvider,
    ClientContext,
    KitClientProvider,
    useChain,
    useClient,
    type ChainIdentifier,
    type ChainProviderProps,
    type KitClientProviderProps,
    type SolanaChain,
} from './client-context';

// Runtime-checked capability narrowing
export { useClientCapability, type UseClientCapabilityOptions } from './client-capability';

// Dev-mode identity-churn warning (exported for third-party providers)
export { useIdentityChurnWarning, type UseIdentityChurnWarningOptions } from './dev-warnings';

// Errors
export { isAbortError } from './kit-prereqs';

// Providers
export { PluginProvider, type PluginProviderProps } from './providers/plugin-provider';
export {
    IdentityProvider,
    PayerProvider,
    SignerProvider,
    type IdentityProviderProps,
    type PayerProviderProps,
    type SignerProviderProps,
} from './providers/signer-provider';
export {
    RpcProvider,
    SolanaDevnetRpcProvider,
    SolanaLocalRpcProvider,
    SolanaMainnetRpcProvider,
    type RpcProviderProps,
    type SolanaDevnetRpcProviderProps,
    type SolanaLocalRpcProviderProps,
    type SolanaMainnetRpcProviderProps,
} from './providers/rpc-provider';
export { RpcConnectionProvider, type RpcConnectionProviderProps } from './providers/rpc-connection-provider';
export { LiteSvmProvider, type LiteSvmProviderProps } from './providers/litesvm-provider';

// Signer hooks
export { useIdentity, usePayer } from './hooks/signers';

// Live data
export { useBalance, createBalanceLiveData } from './hooks/use-balance';
export { useAccount, createAccountLiveData } from './hooks/use-account';
export {
    createTransactionConfirmationLiveData,
    useTransactionConfirmation,
    type TransactionConfirmationStatus,
    type UseTransactionConfirmationOptions,
} from './hooks/use-transaction-confirmation';
export { createLiveDataSpec, useLiveData, type LiveDataSpec } from './hooks/use-live-data';
export { useSubscription, type ReactiveStreamSource } from './hooks/use-subscription';
export { useRequest, type ReactiveActionSource } from './hooks/use-request';
export type { LiveQueryResult } from './internal/live-query-result';
export type { UnwrapRpcResponse } from './internal/subscription-result';
export type { RequestResult } from './internal/request-result';

// Actions
export { useAction, type ActionResult } from './hooks/use-action';
export { useSendTransaction, useSendTransactions } from './hooks/use-send-transaction';
export { usePlanTransaction, usePlanTransactions } from './hooks/use-plan-transaction';
