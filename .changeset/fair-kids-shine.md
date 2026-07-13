---
'@solana/kit-plugin-wallet': minor
---

Add cross-wallet account selection and targeted disconnect.

`selectAccount` now accepts an account belonging to any authorized wallet, not just the active one. When the account belongs to a different authorized wallet, the active connection switches to it synchronously (no reconnect prompt), leaving the previously-active wallet authorized. The owning wallet is resolved from the account handle's identity, so selection is unambiguous even when the same address is authorized in two different wallets.

This also means that we can synchronously transition from `disconnected` to `connected` by calling `selectAccount` with a previously authorized but not currently active account. This would previously throw `WALLET__NOT_CONNECTED`. Now throws `WALLET__ACCOUNT_NOT_AVAILABLE` only when the selected account is not available/not authorized.

`disconnect` now takes an optional leading `wallet` argument — `disconnect(wallet?, options?)`. Passing a non-active authorized wallet deauthorizes just that wallet (calling `standard:disconnect` if supported) while leaving the active connection, status, and persisted account untouched; a wallet that is already gone or lacks `standard:disconnect` is a forgiving no-op. Calling `disconnect()` with no argument still disconnects the active wallet as before.

**Breaking:** `client.wallet.disconnect` gained a leading `wallet` parameter. Callers passing options as the first argument must move them to the second: `disconnect(options)` becomes `disconnect(undefined, options)`.
