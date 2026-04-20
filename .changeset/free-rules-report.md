---
'@solana/kit-react': minor
---

Initial release of `@solana/kit-react` — React bindings for Kit.

Core (`@solana/kit-react`): providers (`KitClientProvider`, `RpcProvider`, `RpcReadOnlyProvider`, `LiteSvmProvider`, `PayerProvider`, `IdentityProvider`, `PluginProvider`), signer hooks (`usePayer`, `useIdentity`), live-data hooks (`useBalance`, `useAccount`, `useTransactionConfirmation`, `useLiveQuery`, `useSubscription`), and action hooks (`useAction`, `useSendTransaction`, `useSendTransactions`, `usePlanTransaction`, `usePlanTransactions`). Each send / plan hook asserts only the single capability it calls, matching Kit's granular plugin model. Exports `useClientCapability` as the public, runtime-checked capability helper for third-party hook authors. Signer hooks duck-type on the optional `subscribeToPayer` / `subscribeToIdentity` convention so they stay reactive against any plugin that advertises it without depending on wallet-standard at the type level.

Wallet (`@solana/kit-react/wallet`): `<WalletProvider>` (with `role` prop mapping to the four wallet plugin variants) and the wallet hooks `useWallets`, `useWalletStatus`, `useConnectedWallet`, `useWalletSigner`, `useWalletState`, `useConnectWallet`, `useDisconnectWallet`, `useSelectAccount`, `useSignMessage`, and `useSignIn`. `useConnectedWallet` and `useWalletSigner` are split so the read-only-wallet case (`connected !== null && signer === null`) is visible in the types. Shipped as an optional subpath with `@solana/kit-plugin-wallet` as an optional peer dependency — read-only apps don't install it.
