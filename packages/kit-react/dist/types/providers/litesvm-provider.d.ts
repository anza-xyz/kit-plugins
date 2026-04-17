import { type ReactNode } from 'react';
/** Props for {@link LiteSvmProvider}. */
export type LiteSvmProviderProps = {
    children?: ReactNode;
};
/**
 * Drop-in replacement for {@link RpcProvider} in test and development
 * environments. Installs the `litesvm()` plugin chain which provides the same
 * client capabilities (`rpc`, transaction planning, `sendTransaction(s)`)
 * backed by a local LiteSVM instance instead of a remote RPC node.
 *
 * Requires `client.payer` to be set by an ancestor provider.
 *
 * @throws If no ancestor provider has set `client.payer`.
 *
 * @example
 * ```tsx
 * <KitClientProvider chain="solana:devnet">
 *     <PayerProvider signer={testPayer}>
 *         <LiteSvmProvider>
 *             <App />
 *         </LiteSvmProvider>
 *     </PayerProvider>
 * </KitClientProvider>
 * ```
 */
export declare function LiteSvmProvider({ children }: LiteSvmProviderProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=litesvm-provider.d.ts.map