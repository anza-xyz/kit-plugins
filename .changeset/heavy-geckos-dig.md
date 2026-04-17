---
'@solana/kit-react-wallet': minor
---

Initial release of `@solana/kit-react-wallet` — React bindings for `@solana/kit-plugin-wallet`. Ships `<WalletProvider>` (with `role` prop mapping to the four wallet plugin variants) and the wallet hooks `useWallets`, `useWalletStatus`, `useConnectedWallet`, `useWalletSigner`, `useWalletState`, `useConnectWallet`, `useDisconnectWallet`, `useSelectAccount`, `useSignMessage`, and `useSignIn`. `useConnectedWallet` and `useWalletSigner` are split so the read-only-wallet case (`connected !== null && signer === null`) is visible in the types and can't be accidentally dereferenced. Peer-depends on `@solana/kit-react` and `@solana/kit-plugin-wallet`. Pairs with the signer hooks (`usePayer` / `useIdentity`) that live in `@solana/kit-react`.
