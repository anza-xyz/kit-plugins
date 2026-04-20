# Review: `@solana/kit-react` and `@solana/kit-react-wallet`

Focus: **DX, flexibility, avoiding footguns.** Scope is the spec at [react-lib-spec.md](react-lib-spec.md) plus the prototype in [packages/kit-react/](packages/kit-react/) and [packages/kit-react-wallet/](packages/kit-react-wallet/).

---

## Session status (2026-04-20)

Items reviewed in this session and their current state. Each section below is annotated with `✅ Resolved`, `🟡 Deferred`, or `🟠 Open`.

**Resolved (landed in code + docs):**

- Read-only apps: added `solanaRpcReadOnly()` plugin to [`@solana/kit-plugin-rpc`](packages/kit-plugin-rpc/src/solana-rpc.ts) and matching [`RpcReadOnlyProvider`](packages/kit-react/src/providers/rpc-read-only-provider.tsx) to kit-react. Read-only apps now use the named provider directly; `PluginProvider` stays as the fallback for finer-grained stacks. README + spec updated.
- Split `useConnectedWallet` (returns `{account, wallet}`) and new `useWalletSigner` (returns `WalletSigner | null`). Projection in `useConnectedWallet` is memoized so signer-only upstream changes don't re-render consumers.
- `RpcProvider` props refactored to `SolanaRpcConfig & {children}` — picks up every plugin option for free (`rpcUrl`, `rpcSubscriptionsUrl`, `priorityFees`, `maxConcurrency`, `rpcConfig`, `rpcSubscriptionsConfig`, `skipPreflight`) with no drift risk.
- `useAction` status renamed `'sending'` → `'running'` (neither `'sending'` nor `'pending'` fit — one is transactional, the other collides with the wallet plugin's not-initialized state).
- New public `useClientCapability<T>({capability, hookName, providerHint})` — runtime-checked capability narrowing for third-party hook authors. Existing internal helpers rewritten to use it; send/plan hooks now assert only the single capability they call, matching Kit's granular plugin model.
- `KitClientProvider` StrictMode double-dispose + value→undefined crash fixed by moving owned-client management into `useMemo` keyed on `providedClient`.
- `useSubscription` factory can now return `null` to disable (matches the `useBalance(null)` convention).
- New `usePlanTransaction` / `usePlanTransactions` hooks mirror the send hooks for preview-then-send UX.
- Aggregator example in the spec updated to use `useWalletSigner` with a null check — no longer crashes on read-only wallets.
- Duplicated `errors.ts` in `kit-react-wallet/internal` deleted now that `useClientCapability` is public.

**Deferred:**

- `priorityFees: MicroLamports` typed cast — intentional: matches plugin input, don't want extra branding magic in the React layer. The `SolanaRpcConfig` refactor above makes this fully consistent with the plugin.
- `KitClientProvider` dev-warning on prop toggle — dropped. On reflection, toggling `client={x}` → `client={undefined}` isn't a common pattern; the real issue was the crash, which is now fixed.

**Still open (queue for a future pass):**

- ~~`useAction` writes `fnRef.current = fn` during render (concurrent-rendering subtlety).~~ ✅ Resolved — moved to `useEffect`.
- ~~`RpcProvider` / `PayerProvider` / `LiteSvmProvider` lack the churn-warning pattern that `PluginProvider` / `WalletProvider` already have.~~ ✅ Resolved — extracted a shared `useIdentityChurnWarning` helper (public export) and wired every provider that has churnable props into it: `PluginProvider`, `WalletProvider`, `RpcProvider`, `RpcReadOnlyProvider`, `PayerProvider`, `IdentityProvider`, `KitClientProvider`. Warning message format is unified across all seven. `LiteSvmProvider` has no churnable props so no warning is needed.
- ~~`WalletProvider` double-install only warns.~~ ✅ Resolved — now throws unconditionally (dev + prod). The inline `useEffect` warning was replaced with a `useParentWithoutWallet()` hook call; see "Conditional throws" below for the rules-of-hooks motivation. Error message explains both causes (baked-in plugin, `PluginProvider` stack) and both valid fixes. Regression test added in [wallet-provider.test.tsx](packages/kit-react-wallet/test/wallet-provider.test.tsx).
- ~~Conditional throws in `RpcProvider` / `LiteSvmProvider` (rules-of-hooks brittleness).~~ ✅ Resolved — extracted two internal hooks that each call `useClient()` and throw in-place: [`useParentWithPayer`](packages/kit-react/src/internal/parent-assertions.ts) (used by `RpcProvider` + `LiteSvmProvider`, returns `Client<ClientWithPayer>`) and [`useParentWithoutWallet`](packages/kit-react-wallet/src/internal/parent-assertions.ts) (used by `WalletProvider`). Hook call sequence is now stable at every call site: any future refactor that swaps the throw for a conditional return will make downstream hooks visibly conditional (flaggable by `react-hooks/rules-of-hooks`) rather than silently drifting the hook count. LiteSvm throw-behavior test added for parity with RpcProvider.
- ~~`useAction` `reset()` rethrows `AbortError` — documented but could be smoothed.~~ ✅ Resolved (kept as-is, documented throughout). On reflection, `AbortError` from a supersede / reset **is** a legitimate signal — smoothing it would change the contract, break symmetry with the send-while-send-in-flight abort, and hide cancellation from code that needs to know. The fix is documentation: every `useAction`-based hook (`useAction`, `useSendTransaction`, `useSendTransactions`, `usePlanTransaction`, `usePlanTransactions`) now includes a try/catch + AbortError filter in its primary `@example`, or explicitly points at `useSendTransaction` / `usePlanTransaction`'s shape.
- ~~Remaining spec↔impl drift (`ActionState<T>` generic, `useAction` send-stability sketch, `nullLiveStore` vs `disabledLiveStore` split, `readOptional` in signers).~~ ✅ Resolved — spec pass brought every drift item into alignment with the impl: `ActionState<TArgs, TResult>` two-generic signature, send-stability sketch now uses latest-ref with a post-commit effect, `useBalance` / `useAccount` value mappers now take the unwrapped value (matching how `createReactiveStoreWithInitialValueAndSlotTracking` hands it through), the single `nullStore` was split into named `nullLiveStore` (SSR-inert, `isLoading: true`) / `disabledLiveStore` (user-disabled, `isLoading: false`), and the signer-hook section gained a "Reading capabilities whose getters may throw" subsection showing the `readOptional` helper and explaining why it's load-bearing for wallet-backed flows.
- ~~Small dep-list nits: `useAccount` decoder in deps, `usePayer` / `useIdentity` capability-check order, `wallet-provider.tsx:194` useMemo deps comment.~~ ✅ Resolved — `useAccount` got a module-scope-hoist example in the docblock (no runtime warning; relying on `react-hooks/exhaustive-deps` at the caller — see note below on scoping churn warnings to providers); `usePayer` / `useIdentity` were rewritten on top of `useClientCapability` so the capability check runs before `useSyncExternalStore`; `wallet-provider.tsx` useMemo deps got a three-line comment explaining why the list mirrors the `WalletPluginConfig` fields instead of `config` itself.

---

## Overall shape

The layered design is solid: `KitClientProvider` seeds the context, each other provider maps to one `.use()` call, hooks split by return shape (live data / tracked action / bare callback / reactive value). The `PluginProvider` escape hatch means any framework-agnostic Kit plugin drops in without a React-specific wrapper. The capability-based error messages ("Usually supplied by `<X>` — or any provider that installs …") degrade gracefully for users with custom plugin stacks. Abort propagation through `send` signals is well thought through.

The prototype is faithful to the spec in structure, but several footguns and a couple of genuine bugs have crept in. None are structural; they're mostly small, catchable items before the API locks.

---

## DX

### Read-only apps are harder than the spec promises

> **Status: ✅ Resolved** — on reflection, the named-provider ergonomics were worth it. Added `solanaRpcReadOnly()` to [`@solana/kit-plugin-rpc`](packages/kit-plugin-rpc/src/solana-rpc.ts) (installs `rpc` + `rpcSubscriptions` + `getMinimumBalance`, no payer required) and matching [`RpcReadOnlyProvider`](packages/kit-react/src/providers/rpc-read-only-provider.tsx) in kit-react. `PluginProvider` + `solanaRpcConnection` / `solanaRpcSubscriptionsConnection` stays as the fallback for finer-grained stacks. README + spec updated.

The spec sells a "wallet-agnostic core" where read-only dashboards and server flows can depend on core alone. In the prototype, [RpcProvider](packages/kit-react/src/providers/rpc-provider.tsx#L60-L66) and [LiteSvmProvider](packages/kit-react/src/providers/litesvm-provider.tsx#L33-L39) both throw when `client.payer` is missing. A read-only explorer therefore has to mount a dummy `PayerProvider` just to get `useBalance` working, which is exactly the coupling the split design was meant to avoid.

Options to close this:
- Add a read-only variant (`RpcReadOnlyProvider`, or `RpcProvider payerless`) backed by whatever plugin in `@solana/kit-plugin-rpc` installs `rpc` + `rpcSubscriptions` without transaction sending.
- Or: make the payer check opt-in and skip installing the transaction-sending half when absent.

Either way, document the escape path explicitly — right now the spec's own motivating example (read-only dashboard, [spec.md:10](react-lib-spec.md#L10)) has no documented path.

### `connected.signer` is nullable, but the spec examples pretend it isn't

> **Status: ✅ Resolved** — split landed. [`useConnectedWallet`](packages/kit-react-wallet/src/hooks/wallet-state.ts) now returns `{account, wallet} | null` with a memoized projection so signer-only changes upstream don't re-render its consumers. New [`useWalletSigner`](packages/kit-react-wallet/src/hooks/wallet-state.ts) returns `WalletSigner | null` on its own. Spec + README + aggregator example updated accordingly.

[`useConnectedWallet`](packages/kit-react-wallet/src/hooks/wallet-state.ts#L81) returns `{ account, signer: WalletSigner | null, wallet } | null`. The `signer` is `null` for wallets that don't support signing (read-only, watch-only, chain-mismatch). The spec's DeFi aggregator example ([spec.md:882](react-lib-spec.md#L882)) does `connected.signer.signTransactions([...])` with no null check — that crashes on read-only wallets and is going to be copy-pasted. Two tighter-up options:

1. Fix the examples to narrow (`if (!connected?.signer) return`), and underline the "connected ≠ signable" distinction in the hook docblock.
2. Consider splitting: `useConnectedWallet()` returning the account/wallet pair (always `{account, wallet} | null`), and `useWalletSigner()` returning `WalletSigner | null` for the signing capability. Callers who want both intersect them naturally.

I'd lean (2) — it encodes the invariant in types rather than comments, and matches the existing precedent of `usePayer() / useIdentity()` returning signers independently of wallet state.

### `priorityFees: MicroLamports` forces a cast for the common case

> **Status: 🟡 Deferred (by choice)** — kept `MicroLamports` to match the plugin input. Instead, [`RpcProvider`](packages/kit-react/src/providers/rpc-provider.tsx) props were refactored to `SolanaRpcConfig & {children}`, so the provider surface matches the plugin exactly (zero drift, auto-picks-up any future option). The narrower concern — literal `100_000` vs branded `MicroLamports` — is a plugin-level decision, not a React-layer one.

[RpcProvider.priorityFees](packages/kit-react/src/providers/rpc-provider.tsx#L21) is typed as `MicroLamports`. Most call sites want to type a literal (`100_000`). Accepting `number | bigint | MicroLamports` and branding internally would save the cast without weakening typing elsewhere.

### Generic `useAction` reads as transaction-flavored

> **Status: ✅ Resolved** — renamed `'sending'` → `'running'`. `'pending'` was ruled out because the wallet plugin already uses it for "not initialized yet" and the overlap confused reads. `'running'` is neutral (neither "fetch" nor "tx submit"), reads naturally in prose, and fits the mixed use cases (sign-then-send, aggregator fetch, plain tx). [packages/kit-react/src/hooks/use-action.ts](packages/kit-react/src/hooks/use-action.ts), tests, and [react-lib-spec.md](react-lib-spec.md) all updated.

`status: 'idle' | 'sending' | 'success' | 'error'` in [use-action.ts:5](packages/kit-react/src/hooks/use-action.ts#L5) leaks the transactional vocabulary into a generic async primitive. For the DeFi aggregator example (fetch to an external API), `'sending'` is narrowly right but reads as odd; `'pending' | 'idle' | 'success' | 'error'` would generalize better. Given `useAction` is explicitly exported as "the building block behind `useSendTransaction`" and for custom async flows, the hook name and status names should match that framing.

### No typed-capability helper for third-party hooks

> **Status: ✅ Resolved** — new public export [`useClientCapability`](packages/kit-react/src/client-capability.ts) takes `{capability, hookName, providerHint}` (single key or array), performs the runtime `in` check, and throws the same consistently-formatted error core hooks use. All three internal helpers (`useRpcClient`, `useSendingClient`, `useWalletClient`) rewritten to use it. Per the "granular plugins" discussion, each send/plan hook now checks only its single capability (`planTransaction`, `sendTransactions`, etc.) — the over-broad `useSendingClient` that asserted both methods was replaced with four per-method helpers.

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

> **Status: ✅ No action needed.**

Accepting `plugin` or `plugins`, maintaining the nesting-order == plugin-chain-order contract, with churn detection — this is the best part of the design. Plugin authors now have a very clean story: "ship a Kit plugin, optionally a hook package, no React wrappers needed."

### `KitClientProvider client={…}` handoff is clean

> **Status: ✅ Resolved (scope narrowed)** — the dev-warning-on-toggle idea was dropped after discussion: toggling `client={maybeX}` across renders isn't a common pattern, and the real issue was the `ownedClient!` crash on value→undefined (the non-null assertion blew up because the lazy `useState` never re-ran). The rewrite in [client-context.tsx](packages/kit-react/src/client-context.tsx) moves owned-client management into `useMemo` keyed on `providedClient`, which fixes both the crash and the StrictMode double-dispose (formerly footgun #1 below).

The ownership switch at mount (spec:114, [client-context.tsx:199-212](packages/kit-react/src/client-context.tsx#L199-L212)) is a good SSR / custom-factory story. The docblock correctly calls out that toggling `providedClient` across renders isn't supported — but there's no runtime guard. A dev-mode warning on toggle would make this a first-class rule rather than a documented convention.

### `useSubscription` can't be disabled

> **Status: ✅ Resolved** — factory can now return `null` to disable. [use-subscription.ts](packages/kit-react/src/hooks/use-subscription.ts) short-circuits before firing any RPC traffic; data + error stay `undefined`. Matches the `useBalance(null)` / `useAccount(null)` / `useTransactionConfirmation(null)` convention. Spec updated with an "enabled" example.

Inconsistent with every other live hook. [use-subscription.ts](packages/kit-react/src/hooks/use-subscription.ts) has no `null` gate — callers with "subscribe only when feature flag on" have to unmount the parent rather than passing `null`. Minor but surprising given the named hooks all support it.

### No `usePlanTransaction` for "preview then send" UX

> **Status: ✅ Resolved** — [`usePlanTransaction`](packages/kit-react/src/hooks/use-plan-transaction.ts) and `usePlanTransactions` added, mirroring the send hooks. Each asserts only its own capability (`planTransaction` / `planTransactions`) to match the granular plugin model — a plugin that installs just `planTransaction` is enough for `usePlanTransaction`. Plan output feeds straight into `useSendTransaction().send(planned)`. README + spec updated with a preview-then-send example.

The spec shows a three-step sign-then-send flow with `useAction` ([spec.md:843](react-lib-spec.md#L843)). That pattern is common enough (confirmation modal that shows the planned fee / writable accounts) that a dedicated `usePlanTransaction` could be worth promoting from the docs. Fine to defer; just flagging for the futures section.

---

## Footguns

These are the things most likely to bite real users, ranked roughly by severity.

### 1. StrictMode disposes the owned client

> **Status: ✅ Resolved** — rolled into the `KitClientProvider` rewrite. Owned client now lives in a `useMemo(() => createClient(), [providedClient])`; StrictMode's synthetic unmount runs the effect cleanup (disposes the owned client), the synthetic remount re-runs the memo (creates a fresh one), and the new effect registers its cleanup against the new client. The old pattern handed back a disposed client on the second mount.

[`KitClientProvider`](packages/kit-react/src/client-context.tsx#L199-L212) stores the owned client in `useState(() => createClient())`, then disposes it in an effect cleanup. React 18 StrictMode's synthetic mount → unmount → mount sequence will fire the cleanup after the first mount — [`disposeClient`](packages/kit-react/src/internal/dispose.ts#L20) runs against the owned client. On the second (real) mount, the `useState` initializer does *not* re-run (state is preserved across StrictMode's double-invoke), so the provider keeps using the now-disposed client.

The `DISPOSED` `WeakSet` makes dispose idempotent but doesn't solve this — you want the client to be recreated, not skipped-dispose. A ref-based re-init is the common fix:

```tsx
const clientRef = useRef<Client<object> | null>(null);
if (clientRef.current === null) clientRef.current = createClient();
useEffect(() => () => { disposeClient(clientRef.current!); clientRef.current = null; }, []);
```

This shape recreates on the second StrictMode mount instead of handing out a dead client.

### 2. Focused wallet-state hooks may not actually be focused

> **Status: ✅ Resolved (verified + enhanced)** — checked [packages/kit-plugin-wallet/src/store.ts](packages/kit-plugin-wallet/src/store.ts#L123-L141): `setState` only builds a new `WalletState` snapshot when a snapshot-relevant field actually changes, keeping `state.wallets` / `state.connected` / `state.status` referentially stable when irrelevant internal fields change. The new `useConnectedWallet` projection adds its own memoization layer on top so signer-only changes within `connected` don't invalidate the `{account, wallet}` pair.

[`useWallets`](packages/kit-react-wallet/src/hooks/wallet-state.ts#L35), [`useWalletStatus`](packages/kit-react-wallet/src/hooks/wallet-state.ts#L53), [`useConnectedWallet`](packages/kit-react-wallet/src/hooks/wallet-state.ts#L81) each project a slice out of `client.wallet.getState()`. `useSyncExternalStore` only skips the re-render if the projection returns a referentially identical value. If the upstream wallet plugin builds a fresh `{wallets, status, connected}` object on every internal state change (common in reducer patterns), every subscriber re-renders on every change regardless of slice. This needs an upstream guarantee (memoized slice references) and ideally a test that asserts it — otherwise the "subscribe only to what you need" pitch in the spec is vapor.

### 3. `useAction` writes to a ref during render

> **Status: ✅ Resolved** — moved the ref write into a post-commit `useEffect` in [use-action.ts](packages/kit-react/src/hooks/use-action.ts). Discarded concurrent renders can no longer leave the ref pointing at a closure that captured never-committed props / context. The one-render lag is unobservable because `send` only runs from event handlers (post-commit).

[use-action.ts:109](packages/kit-react/src/hooks/use-action.ts#L109) does `fnRef.current = fn` during render with an eslint-disable. This is the "latest ref" pattern and it's technically legal but the React docs discourage it for exactly one reason: under concurrent rendering, a discarded render can leave `fnRef.current` ahead of committed state. The canonical pattern is `useEffect(() => { fnRef.current = fn; })`. The tradeoff is that the first `send` call after a re-render uses the *previous* `fn` — but since `send` is already async, this matches mental-model-wise and is safer under concurrent features.

Either move the write to an effect, or commit to the documented tradeoff with a comment that covers concurrent-rendering edge cases.

### 4. RpcProvider / PayerProvider / LiteSvmProvider lack churn detection

> **Status: ✅ Resolved** — extracted [`useIdentityChurnWarning`](packages/kit-react/src/dev-warnings.ts) as a public helper and wired it into every provider with churnable props (`PluginProvider`, `WalletProvider`, `RpcProvider`, `RpcReadOnlyProvider`, `PayerProvider`, `IdentityProvider`, `KitClientProvider`). Single source of truth for threshold, bookkeeping, dev-only gate, and message format. `LiteSvmProvider` has no churnable props so no warning is needed. Third-party plugin authors shipping custom providers can use the same hook for consistent DX.

`PluginProvider` and `WalletProvider` both have dev-mode churn warnings (nice!). The other internal providers don't. A user passing `priorityFees={microLamports(100n)}` inline ([rpc-provider.tsx:60](packages/kit-react/src/providers/rpc-provider.tsx#L60)) or a fresh `signer` each render to `PayerProvider` silently rebuilds the plugin chain, tearing down subscriptions and connection state. Extending the same dev warning pattern to these providers closes the asymmetry.

### 5. `WalletProvider` detects double-install but only warns

> **Status: ✅ Resolved** — now throws unconditionally (dev + prod). Short-circuiting was ruled out because React's inner-shadows-outer mental model makes a silent skip worse than the alleged ergonomics gain: it would ignore the inner provider's `storageKey` / `filter` / `storage` props without surfacing the conflict. The assertion landed via the new `useParentWithoutWallet()` hook (see #7 for the rules-of-hooks motivation). Regression test covers the nested-`<WalletProvider>` case in both browser + react-native matrices.

### 6. `useClient<TClient>()` is an unchecked cast

> **Status: ✅ Resolved** — addressed via the new `useClientCapability` export (see DX section above). `useClient<T>()` remains for advanced cases; third-party hooks are now pointed at `useClientCapability` in the spec and README.

Documented as a type assertion (spec:979, [client-context.tsx:72](packages/kit-react/src/client-context.tsx#L72)). The footgun is that `useClient<DasClient>().das.getAsset(...)` doesn't fail at mount — it fails at call site with a TypeError. For third-party hook authors who can't know whether their user mounted `<DasProvider>`, a runtime-checked variant (see "No typed-capability helper" above) would make this a loud failure instead of a silent one.

### 7. Conditional throw in RpcProvider / LiteSvmProvider is correct today but brittle

> **Status: ✅ Resolved** — extracted two small internal hooks that bundle the `useClient()` + throw pair into a single stable call position:
>
> - [`useParentWithPayer(providerName, extraHint?)`](packages/kit-react/src/internal/parent-assertions.ts) returns `Client<ClientWithPayer>`. Used by [`RpcProvider`](packages/kit-react/src/providers/rpc-provider.tsx#L64-L69) (passes the read-only-app hint as `extraHint`) and [`LiteSvmProvider`](packages/kit-react/src/providers/litesvm-provider.tsx#L33-L36).
> - [`useParentWithoutWallet()`](packages/kit-react-wallet/src/internal/parent-assertions.ts) returns `Client<object>`. Used by [`WalletProvider`](packages/kit-react-wallet/src/wallet-provider.tsx#L115-L126) to refuse double-installs (see #5).
>
> The hooks always run in the same position, so any future refactor that swaps the throw for a conditional `return` will make downstream hook calls visibly conditional — flaggable by `react-hooks/rules-of-hooks`. Kept the hooks internal rather than exporting them publicly; can be promoted if third-party provider authors want the same pattern. Tests cover both `RpcProvider` and `LiteSvmProvider` throw-on-missing-payer.

### 8. Spec's `useConnectedWallet` aggregator example crashes on read-only wallets

> **Status: ✅ Resolved** — example updated in [react-lib-spec.md](react-lib-spec.md) to use `useWalletSigner` with an explicit null check inside the action body.

Called out under DX above but listing here too since it's an example that will be copied.

### 9. `useAction` `reset()` rethrows AbortError

> **Status: ✅ Resolved (kept as-is, documented)** — on review, AbortError from a supersede / reset is legitimate signal, not a bug: it matches the JS ecosystem convention (`fetch({signal})`, `AbortablePromise`, RxJS), preserves symmetry with the send-while-send-in-flight abort, and lets consumers who *want* to know about cancellation distinguish it from real errors. Swallowing would change the contract without a clear win.
>
> The fix landed via documentation: the primary `@example` on [`useAction`](packages/kit-react/src/hooks/use-action.ts), [`useSendTransaction`](packages/kit-react/src/hooks/use-send-transaction.ts), and [`usePlanTransaction`](packages/kit-react/src/hooks/use-plan-transaction.ts) now shows the try/catch + `if ((err as Error).name === 'AbortError') return;` pattern explicitly. [`useSendTransactions`](packages/kit-react/src/hooks/use-send-transaction.ts) and [`usePlanTransactions`](packages/kit-react/src/hooks/use-plan-transaction.ts) point at their single-variant siblings for the shape. Copy-pasting any primary example now gives callers the right filter.

---

## Spec ↔ implementation drift

All items below were resolved in a spec pass on 2026-04-20 — in every case the impl was ground truth and the spec text was updated to match.

- ✅ `ActionState<T>` → `ActionState<TArgs, TResult>`. The spec now shows the two-generic signature and the downstream hook signatures use `Parameters<ClientWithTransactionSending['sendTransaction']>` etc. so callers get real autocomplete on `send(...)`.
- ✅ `useAction` `send` stability: spec sketch rewritten to use the latest-ref pattern with a post-commit effect, matching the impl. The `useCallback(fn, [fn])` version is gone.
- ✅ `useBalance` / `useAccount` value mappers: the spec sketches now take the unwrapped value (`(lamports) => lamports`, `(value) => { ... }`) with a brief comment explaining that `createReactiveStoreWithInitialValueAndSlotTracking` unwraps the `SolanaRpcResponse` envelope before calling the mapper. `useTransactionConfirmation` was already correct.
- ✅ **Bonus, out of original review scope:** while reconciling the mapper drift, noticed the slot was tracked internally (the store is `ReactiveStore<SolanaRpcResponse<T>>`, used for slot-dedup) but not surfaced to callers. Exposed it as `LiveQueryResult<T>.slot: Slot | undefined`, drawn from the same snapshot as `data` so they always correspond. Enables "as of slot X" freshness UI, coordinating a refetch with a just-sent tx's slot, and stale-data detection — all use cases that previously forced callers down into `useLiveQuery`, which couldn't surface the slot either. Test coverage added in [live-store.test.tsx](packages/kit-react/test/live-store.test.tsx).
- ✅ `nullStore` split: replaced the single `nullStore` constant in the spec with two named factories (`nullLiveStore` for SSR-inert, `disabledLiveStore` for user-disabled) and wired them through every sketch (`useBalance` / `useAccount` / `useTransactionConfirmation` / `useLiveStore` / `useLiveQueryResult`). The "Disabled vs. loading vs. server render" block now calls out the split explicitly so readers understand why it's two stores, not one.
- ✅ The DeFi aggregator example (spec:882) — fixed earlier as part of the `useWalletSigner` split.
- ✅ Signer-hook `readOptional` swallow: added a new "Reading capabilities whose getters may throw" subsection under the signer hooks, showing the helper and explaining why it's load-bearing for wallet-backed flows (getters throw when disconnected; `useSyncExternalStore` unmounts on thrown getSnapshot; the outer `'payer' in client` check still catches missing-plugin bugs).

---

## Smaller nits

- ✅ `useAccount` `decoder` in deps — resolved with a module-scope-hoist example in the docblock. A runtime churn warning was considered and then dropped: runtime dev warnings aren't idiomatic React (most libraries hash keys, let renders happen silently, or defer to ESLint / React Compiler), so the pattern is worth keeping only where the consequence is catastrophic — tearing down WebSockets / discovery / wallet connections. `useAccount` rebuilds the store when `decoder` churns, which is wasteful but not semantically broken (same mechanism as changing `address`), so it doesn't clear that bar. `react-hooks/exhaustive-deps` at the caller's site is the idiomatic feedback loop. The `useIdentityChurnWarning` docblock has been updated to scope the pattern explicitly to providers.
- ✅ `useTransactionConfirmation` — already resolved. `commitment` is destructured up top at [line 61](packages/kit-react/src/hooks/use-transaction-confirmation.ts#L61) and only the string (not the `options` object) is in the deps array, so inline `{commitment: 'confirmed'}` doesn't rebuild.
- ✅ `wallet-provider.tsx` useMemo deps — resolved. Added a comment above the memo explaining that `config` is constructed fresh inside the memo body, so the deps list mirrors the `WalletPluginConfig` fields instead.
- ✅ `errors.ts` duplication — resolved. The wallet package's `internal/errors.ts` was removed when `useClientCapability` became public; both packages now go through that shared helper.
- ✅ `usePayer` / `useIdentity` capability-check order — resolved. Both hooks were rewritten on top of `useClientCapability` so the capability check happens first (inside the helper), returning the narrowed client. The subsequent `useSyncExternalStore` is only reached once the capability is confirmed — same throw behavior and error format, but the read order now matches the mental model. Existing throw-on-missing tests still cover the behavior.

---

## Summary

The design is the right shape: layered, composable, and hooks-first. The three biggest items called out in the original review — the StrictMode client-disposal bug, the read-only story, and the `connected.signer` null-ness — all landed. Since then every follow-up item has been addressed: churn warnings unified across providers (and now `useAccount`'s `decoder`), `useAction` moved its ref write into an effect, `WalletProvider` throws on double-install, provider-side payer / wallet assertions live in dedicated hooks with stable call positions, the AbortError contract is documented on every `useAction`-based hook, `LiveQueryResult.slot` is now surfaced for freshness UIs, `usePayer` / `useIdentity` do the capability check before reaching for the subscribe shape, and the spec was brought back into alignment with the impl across every drift item. The queue is empty — ready to circulate the spec.
