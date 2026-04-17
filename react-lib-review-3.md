# Review: `@solana/kit-react` and `@solana/kit-react-wallet`

Focus: **DX, flexibility, avoiding footguns.** Scope is the spec at [react-lib-spec.md](react-lib-spec.md) plus the prototype in [packages/kit-react/](packages/kit-react/) and [packages/kit-react-wallet/](packages/kit-react-wallet/).

## Overall shape

The layered design is solid: `KitClientProvider` seeds the context, each other provider maps to one `.use()` call, hooks split by return shape (live data / tracked action / bare callback / reactive value). The `PluginProvider` escape hatch means any framework-agnostic Kit plugin drops in without a React-specific wrapper. The capability-based error messages ("Usually supplied by `<X>` — or any provider that installs …") degrade gracefully for users with custom plugin stacks. Abort propagation through `send` signals is well thought through.

The prototype is faithful to the spec in structure, but several footguns and a couple of genuine bugs have crept in. None are structural; they're mostly small, catchable items before the API locks.

---

## DX

### Read-only apps are harder than the spec promises

The spec sells a "wallet-agnostic core" where read-only dashboards and server flows can depend on core alone. In the prototype, [RpcProvider](packages/kit-react/src/providers/rpc-provider.tsx#L60-L66) and [LiteSvmProvider](packages/kit-react/src/providers/litesvm-provider.tsx#L33-L39) both throw when `client.payer` is missing. A read-only explorer therefore has to mount a dummy `PayerProvider` just to get `useBalance` working, which is exactly the coupling the split design was meant to avoid.

Options to close this:
- Add a read-only variant (`RpcReadOnlyProvider`, or `RpcProvider payerless`) backed by whatever plugin in `@solana/kit-plugin-rpc` installs `rpc` + `rpcSubscriptions` without transaction sending.
- Or: make the payer check opt-in and skip installing the transaction-sending half when absent.

Either way, document the escape path explicitly — right now the spec's own motivating example (read-only dashboard, [spec.md:10](react-lib-spec.md#L10)) has no documented path.

### `connected.signer` is nullable, but the spec examples pretend it isn't

[`useConnectedWallet`](packages/kit-react-wallet/src/hooks/wallet-state.ts#L81) returns `{ account, signer: WalletSigner | null, wallet } | null`. The `signer` is `null` for wallets that don't support signing (read-only, watch-only, chain-mismatch). The spec's DeFi aggregator example ([spec.md:882](react-lib-spec.md#L882)) does `connected.signer.signTransactions([...])` with no null check — that crashes on read-only wallets and is going to be copy-pasted. Two tighter-up options:

1. Fix the examples to narrow (`if (!connected?.signer) return`), and underline the "connected ≠ signable" distinction in the hook docblock.
2. Consider splitting: `useConnectedWallet()` returning the account/wallet pair (always `{account, wallet} | null`), and `useWalletSigner()` returning `WalletSigner | null` for the signing capability. Callers who want both intersect them naturally.

I'd lean (2) — it encodes the invariant in types rather than comments, and matches the existing precedent of `usePayer() / useIdentity()` returning signers independently of wallet state.

### `priorityFees: MicroLamports` forces a cast for the common case

[RpcProvider.priorityFees](packages/kit-react/src/providers/rpc-provider.tsx#L21) is typed as `MicroLamports`. Most call sites want to type a literal (`100_000`). Accepting `number | bigint | MicroLamports` and branding internally would save the cast without weakening typing elsewhere.

### Generic `useAction` reads as transaction-flavored

`status: 'idle' | 'sending' | 'success' | 'error'` in [use-action.ts:5](packages/kit-react/src/hooks/use-action.ts#L5) leaks the transactional vocabulary into a generic async primitive. For the DeFi aggregator example (fetch to an external API), `'sending'` is narrowly right but reads as odd; `'pending' | 'idle' | 'success' | 'error'` would generalize better. Given `useAction` is explicitly exported as "the building block behind `useSendTransaction`" and for custom async flows, the hook name and status names should match that framing.

### No typed-capability helper for third-party hooks

Every internal hook has its own `useRpcClient('useBalance')` / `useSendingClient('useSendTransaction')` / `useWalletClient('useFoo')` pattern ([rpc-client.ts](packages/kit-react/src/internal/rpc-client.ts), [sending-client.ts](packages/kit-react/src/internal/sending-client.ts), [wallet-client.ts](packages/kit-react-wallet/src/internal/wallet-client.ts)). Third-party hook authors (a DAS package, a Jito plugin, …) have to reinvent this. Exporting something like:

```ts
function useCapability<K extends string>(
    hookName: string,
    capability: K,
    hint: string,
): ClientWith<K>;
```

means `useClient<DasClient>()` stops being an unchecked cast and becomes a runtime-checked narrowing — the third-party hook gets the same "mount the right provider" error message quality as core hooks.

---

## Flexibility

### `PluginProvider` is exactly right

Accepting `plugin` or `plugins`, maintaining the nesting-order == plugin-chain-order contract, with churn detection — this is the best part of the design. Plugin authors now have a very clean story: "ship a Kit plugin, optionally a hook package, no React wrappers needed."

### `KitClientProvider client={…}` handoff is clean

The ownership switch at mount (spec:114, [client-context.tsx:199-212](packages/kit-react/src/client-context.tsx#L199-L212)) is a good SSR / custom-factory story. The docblock correctly calls out that toggling `providedClient` across renders isn't supported — but there's no runtime guard. A dev-mode warning on toggle would make this a first-class rule rather than a documented convention.

### `useSubscription` can't be disabled

Inconsistent with every other live hook. [use-subscription.ts](packages/kit-react/src/hooks/use-subscription.ts) has no `null` gate — callers with "subscribe only when feature flag on" have to unmount the parent rather than passing `null`. Minor but surprising given the named hooks all support it.

### No `usePlanTransaction` for "preview then send" UX

The spec shows a three-step sign-then-send flow with `useAction` ([spec.md:843](react-lib-spec.md#L843)). That pattern is common enough (confirmation modal that shows the planned fee / writable accounts) that a dedicated `usePlanTransaction` could be worth promoting from the docs. Fine to defer; just flagging for the futures section.

---

## Footguns

These are the things most likely to bite real users, ranked roughly by severity.

### 1. StrictMode disposes the owned client

[`KitClientProvider`](packages/kit-react/src/client-context.tsx#L199-L212) stores the owned client in `useState(() => createClient())`, then disposes it in an effect cleanup. React 18 StrictMode's synthetic mount → unmount → mount sequence will fire the cleanup after the first mount — [`disposeClient`](packages/kit-react/src/internal/dispose.ts#L20) runs against the owned client. On the second (real) mount, the `useState` initializer does *not* re-run (state is preserved across StrictMode's double-invoke), so the provider keeps using the now-disposed client.

The `DISPOSED` `WeakSet` makes dispose idempotent but doesn't solve this — you want the client to be recreated, not skipped-dispose. A ref-based re-init is the common fix:

```tsx
const clientRef = useRef<Client<object> | null>(null);
if (clientRef.current === null) clientRef.current = createClient();
useEffect(() => () => { disposeClient(clientRef.current!); clientRef.current = null; }, []);
```

This shape recreates on the second StrictMode mount instead of handing out a dead client.

### 2. Focused wallet-state hooks may not actually be focused

[`useWallets`](packages/kit-react-wallet/src/hooks/wallet-state.ts#L35), [`useWalletStatus`](packages/kit-react-wallet/src/hooks/wallet-state.ts#L53), [`useConnectedWallet`](packages/kit-react-wallet/src/hooks/wallet-state.ts#L81) each project a slice out of `client.wallet.getState()`. `useSyncExternalStore` only skips the re-render if the projection returns a referentially identical value. If the upstream wallet plugin builds a fresh `{wallets, status, connected}` object on every internal state change (common in reducer patterns), every subscriber re-renders on every change regardless of slice. This needs an upstream guarantee (memoized slice references) and ideally a test that asserts it — otherwise the "subscribe only to what you need" pitch in the spec is vapor.

### 3. `useAction` writes to a ref during render

[use-action.ts:109](packages/kit-react/src/hooks/use-action.ts#L109) does `fnRef.current = fn` during render with an eslint-disable. This is the "latest ref" pattern and it's technically legal but the React docs discourage it for exactly one reason: under concurrent rendering, a discarded render can leave `fnRef.current` ahead of committed state. The canonical pattern is `useEffect(() => { fnRef.current = fn; })`. The tradeoff is that the first `send` call after a re-render uses the *previous* `fn` — but since `send` is already async, this matches mental-model-wise and is safer under concurrent features.

Either move the write to an effect, or commit to the documented tradeoff with a comment that covers concurrent-rendering edge cases.

### 4. RpcProvider / PayerProvider / LiteSvmProvider lack churn detection

`PluginProvider` and `WalletProvider` both have dev-mode churn warnings (nice!). The other internal providers don't. A user passing `priorityFees={microLamports(100n)}` inline ([rpc-provider.tsx:60](packages/kit-react/src/providers/rpc-provider.tsx#L60)) or a fresh `signer` each render to `PayerProvider` silently rebuilds the plugin chain, tearing down subscriptions and connection state. Extending the same dev warning pattern to these providers closes the asymmetry.

### 5. `WalletProvider` detects double-install but only warns

[wallet-provider.tsx:127-136](packages/kit-react-wallet/src/wallet-provider.tsx#L127-L136) logs a warning when `client.wallet` is already present. In practice, double-installing wallet plugins leads to two discovery listeners, two storage reads, confusing bugs. The warning is fine as a first line; consider either (a) throwing in production too, or (b) short-circuiting (`return children` unchanged) when already installed, with a dev warning explaining what was skipped.

### 6. `useClient<TClient>()` is an unchecked cast

Documented as a type assertion (spec:979, [client-context.tsx:72](packages/kit-react/src/client-context.tsx#L72)). The footgun is that `useClient<DasClient>().das.getAsset(...)` doesn't fail at mount — it fails at call site with a TypeError. For third-party hook authors who can't know whether their user mounted `<DasProvider>`, a runtime-checked variant (see "No typed-capability helper" above) would make this a loud failure instead of a silent one.

### 7. Conditional throw in RpcProvider / LiteSvmProvider is correct today but brittle

[rpc-provider.tsx:62-66](packages/kit-react/src/providers/rpc-provider.tsx#L62-L66) and [litesvm-provider.tsx:35-39](packages/kit-react/src/providers/litesvm-provider.tsx#L35-L39) throw after `useClient()` but before `useMemo`. This works (the throw is fatal — subsequent renders re-execute from scratch) but sits right next to a rules-of-hooks trap: if someone ever changes the throw to a conditional return, the `useMemo` count on subsequent renders won't match. A lint-friendly pattern is to do the capability assertion inside a dedicated hook (`useParentWithPayer(providerName)`) that either returns the narrowed type or throws, keeping the hook sequence stable.

### 8. Spec's `useConnectedWallet` aggregator example crashes on read-only wallets

Called out under DX above but listing here too since it's an example that will be copied.

### 9. `useAction` `reset()` rethrows AbortError

Documented ([use-action.ts:53](packages/kit-react/src/hooks/use-action.ts#L53)). Callers who forget to filter `AbortError` surface spurious errors to the UI after reset. The docblock is good; a sharper option is for `reset()` to *not* rethrow — i.e. swallow the abort silently inside the `send` closure and resolve with a sentinel — but that changes the contract. Keep the current design; just make sure the example in every hook docblock that uses `useAction` (not just `useAction` itself) shows the filter.

---

## Spec ↔ implementation drift

Quick list; worth tightening before the spec is circulated.

- `ActionState<T>` (spec:708) → `ActionState<TArgs, TResult>` in [use-action.ts:13](packages/kit-react/src/hooks/use-action.ts#L13). Impl is strictly better — update the spec.
- `useAction` `send` stability: spec shows `useCallback(fn, [fn])` (spec:771-786) which rebinds on every `fn` change; impl uses the latest-ref pattern for a truly stable `send`. Impl is better — update the spec.
- `useBalance` implementation sketch in spec (spec:513) passes `client.rpcSubscriptions.accountNotifications(address)` raw; impl correctly maps `{lamports}` ([use-balance.ts:48](packages/kit-react/src/hooks/use-balance.ts#L48)). Minor.
- `nullStore` in spec (spec:603) collapses with the server-inert store; impl splits them: `nullLiveStore` (server inert, reports `isLoading: true`) vs `disabledLiveStore` (user opt-out, reports `isLoading: false`). Impl is better — update the spec and surface the split in the "Disabled vs. loading vs. server render" block.
- The DeFi aggregator example (spec:882) does not null-check `connected.signer`. Fix.
- Spec's signer-hook implementation ([spec:~400-430](react-lib-spec.md)) doesn't mention the `readOptional` swallowing of thrown getters; impl does ([signers.ts:31-37](packages/kit-react/src/hooks/signers.ts#L31-L37)). Worth adding — it's load-bearing for wallet-backed payers.

---

## Smaller nits

- [use-account.ts:80](packages/kit-react/src/hooks/use-account.ts#L80) includes `decoder` in deps. A caller passing `getGameStateDecoder()` inline will rebuild the store every render. Either document "memoize or hoist decoders" (as with `filter`), add a churn warning, or accept a `decoder` prop with a stable identity assumption baked into the docblock.
- [use-transaction-confirmation.ts:61](packages/kit-react/src/hooks/use-transaction-confirmation.ts#L61) reads `options?.commitment` and rebuilds on change. A caller passing `{commitment: 'confirmed'}` inline rebuilds on every render. Pull the default + destructure up top and only include the commitment string in deps.
- [wallet-provider.tsx:194](packages/kit-react-wallet/src/wallet-provider.tsx#L194) useMemo deps list the individual props but not `config` — fine because config is freshly constructed inside the memo body. Worth a one-line comment since the shape looks wrong at a glance.
- `errors.ts` is duplicated between `kit-react` and `kit-react-wallet` internals. Fine for now (the comment in [wallet errors.ts](packages/kit-react-wallet/src/internal/errors.ts) calls it out) but consider a shared internal `@solana/kit-react-internal` if more utilities duplicate.
- Both `usePayer` and `useIdentity` call `throwMissingCapability` *after* `useSyncExternalStore` ([signers.ts:70-78](packages/kit-react/src/hooks/signers.ts#L70-L78)). Functionally fine but reads backwards — do the capability check before reaching for the subscribe shape.

---

## Summary

The design is the right shape: layered, composable, and hooks-first. The biggest items before the API locks are (a) the StrictMode client-disposal bug, (b) the read-only story (RpcProvider requiring a payer), and (c) the `connected.signer` null-ness not being reflected in examples or type contracts. Everything else is polish — churn warnings, spec↔impl drift, dep-list correctness in the named hooks — and readily addressable.
