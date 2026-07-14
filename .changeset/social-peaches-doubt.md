---
'@solana/kit-plugin-wallet': minor
---

The React hooks now take the wallet-enabled `client` as their first argument instead of reading it from a `ClientProvider` context. Every hook — `useWalletStatus`, `useConnectedWallet`, `useWallets`, `useIsWalletReady`, `useConnect`, `useDisconnect`, `useSignIn`, `useSignMessage`, `useSelectAccount` — and the `WalletReadyGate` component (via a new `client` prop) now accept `client: ClientWithWallet` directly. Because the client's type already guarantees the wallet plugin is installed, the runtime capability assertion and the provider requirement are gone. This is a breaking change: pass the client into every hook and into `WalletReadyGate`:

```diff
- const status = useWalletStatus();
- const { dispatch } = useConnect();
+ const status = useWalletStatus(client);
+ const { dispatch } = useConnect(client);
```

```diff
- <WalletReadyGate fallback={<Spinner />}>
+ <WalletReadyGate client={client} fallback={<Spinner />}>
      <WalletDependentUI />
  </WalletReadyGate>
```
