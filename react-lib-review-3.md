# Review: `@solana/kit-react` and `@solana/kit-react-wallet`

Focus: **DX, flexibility, avoiding footguns.** Scope is the spec at [react-lib-spec.md](react-lib-spec.md) plus the prototype in [packages/kit-react/](packages/kit-react/) and [packages/kit-react-wallet/](packages/kit-react-wallet/).

---

## Session status (2026-04-19)

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
- `WalletProvider` double-install only warns — could short-circuit or throw.
- Conditional throws in `RpcProvider` / `LiteSvmProvider` (rules-of-hooks brittleness).
- `useAction` `reset()` rethrows `AbortError` — documented but could be smoothed.
- Remaining spec↔impl drift (`ActionState<T>` generic, `useAction` send-stability sketch, `nullLiveStore` vs `disabledLiveStore` split, `readOptional` in signers).
- Small dep-list nits: `useAccount` decoder in deps, `useTransactionConfirmation` commitment destructure, `usePayer` / `useIdentity` capability-check order.

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

> **Status: 🟠 Open** — queued.

[wallet-provider.tsx:127-136](packages/kit-react-wallet/src/wallet-provider.tsx#L127-L136) logs a warning when `client.wallet` is already present. In practice, double-installing wallet plugins leads to two discovery listeners, two storage reads, confusing bugs. The warning is fine as a first line; consider either (a) throwing in production too, or (b) short-circuiting (`return children` unchanged) when already installed, with a dev warning explaining what was skipped.

### 6. `useClient<TClient>()` is an unchecked cast

> **Status: ✅ Resolved** — addressed via the new `useClientCapability` export (see DX section above). `useClient<T>()` remains for advanced cases; third-party hooks are now pointed at `useClientCapability` in the spec and README.

Documented as a type assertion (spec:979, [client-context.tsx:72](packages/kit-react/src/client-context.tsx#L72)). The footgun is that `useClient<DasClient>().das.getAsset(...)` doesn't fail at mount — it fails at call site with a TypeError. For third-party hook authors who can't know whether their user mounted `<DasProvider>`, a runtime-checked variant (see "No typed-capability helper" above) would make this a loud failure instead of a silent one.

### 7. Conditional throw in RpcProvider / LiteSvmProvider is correct today but brittle

> **Status: 🟠 Open** — queued. The `useClientCapability` rewrite didn't cover the provider-side assertion (those are `useClient()` + `'payer' in …` checks inside the component body, not capability hooks). The ask — move the assertion into a dedicated `useParentWithPayer` hook — would keep the hook sequence stable and remove the rules-of-hooks trap.

[rpc-provider.tsx:62-66](packages/kit-react/src/providers/rpc-provider.tsx#L62-L66) and [litesvm-provider.tsx:35-39](packages/kit-react/src/providers/litesvm-provider.tsx#L35-L39) throw after `useClient()` but before `useMemo`. This works (the throw is fatal — subsequent renders re-execute from scratch) but sits right next to a rules-of-hooks trap: if someone ever changes the throw to a conditional return, the `useMemo` count on subsequent renders won't match. A lint-friendly pattern is to do the capability assertion inside a dedicated hook (`useParentWithPayer(providerName)`) that either returns the narrowed type or throws, keeping the hook sequence stable.

### 8. Spec's `useConnectedWallet` aggregator example crashes on read-only wallets

> **Status: ✅ Resolved** — example updated in [react-lib-spec.md](react-lib-spec.md) to use `useWalletSigner` with an explicit null check inside the action body.

Called out under DX above but listing here too since it's an example that will be copied.

### 9. `useAction` `reset()` rethrows AbortError

> **Status: 🟠 Open (documented)** — queued. No code change needed today; the docblock covers the contract. Worth revisiting if users repeatedly hit the AbortError-in-UI pitfall.

Documented ([use-action.ts:53](packages/kit-react/src/hooks/use-action.ts#L53)). Callers who forget to filter `AbortError` surface spurious errors to the UI after reset. The docblock is good; a sharper option is for `reset()` to *not* rethrow — i.e. swallow the abort silently inside the `send` closure and resolve with a sentinel — but that changes the contract. Keep the current design; just make sure the example in every hook docblock that uses `useAction` (not just `useAction` itself) shows the filter.

---

## Spec ↔ implementation drift

Quick list; worth tightening before the spec is circulated.

- ~~`ActionState<T>` (spec:708) → `ActionState<TArgs, TResult>` in [use-action.ts:13](packages/kit-react/src/hooks/use-action.ts#L13). Impl is strictly better — update the spec.~~ 🟠 Spec status union was updated (`'running'`), but the `ActionState<T>` → `ActionState<TArgs, TResult>` generic signature still needs a spec pass.
- 🟠 `useAction` `send` stability: spec shows `useCallback(fn, [fn])` (spec:771-786) which rebinds on every `fn` change; impl uses the latest-ref pattern for a truly stable `send`. Impl is better — update the spec.
- 🟠 `useBalance` implementation sketch in spec (spec:513) passes `client.rpcSubscriptions.accountNotifications(address)` raw; impl correctly maps `{lamports}` ([use-balance.ts:48](packages/kit-react/src/hooks/use-balance.ts#L48)). Minor.
- 🟠 `nullStore` in spec (spec:603) collapses with the server-inert store; impl splits them: `nullLiveStore` (server inert, reports `isLoading: true`) vs `disabledLiveStore` (user opt-out, reports `isLoading: false`). Impl is better — update the spec and surface the split in the "Disabled vs. loading vs. server render" block.
- ✅ The DeFi aggregator example (spec:882) — fixed as part of the `useWalletSigner` split.
- 🟠 Spec's signer-hook implementation ([spec:~400-430](react-lib-spec.md)) doesn't mention the `readOptional` swallowing of thrown getters; impl does ([signers.ts:31-37](packages/kit-react/src/hooks/signers.ts#L31-L37)). Worth adding — it's load-bearing for wallet-backed payers.

---

## Smaller nits

- 🟠 [use-account.ts:80](packages/kit-react/src/hooks/use-account.ts#L80) includes `decoder` in deps. A caller passing `getGameStateDecoder()` inline will rebuild the store every render. Either document "memoize or hoist decoders" (as with `filter`), add a churn warning, or accept a `decoder` prop with a stable identity assumption baked into the docblock.
- 🟠 [use-transaction-confirmation.ts:61](packages/kit-react/src/hooks/use-transaction-confirmation.ts#L61) reads `options?.commitment` and rebuilds on change. A caller passing `{commitment: 'confirmed'}` inline rebuilds on every render. Pull the default + destructure up top and only include the commitment string in deps.
- 🟠 [wallet-provider.tsx:194](packages/kit-react-wallet/src/wallet-provider.tsx#L194) useMemo deps list the individual props but not `config` — fine because config is freshly constructed inside the memo body. Worth a one-line comment since the shape looks wrong at a glance.
- ✅ `errors.ts` duplication — resolved. The wallet package's `internal/errors.ts` was removed when `useClientCapability` became public; both packages now go through that shared helper.
- 🟠 Both `usePayer` and `useIdentity` call `throwMissingCapability` *after* `useSyncExternalStore` ([signers.ts:70-78](packages/kit-react/src/hooks/signers.ts#L70-L78)). Functionally fine but reads backwards — do the capability check before reaching for the subscribe shape.

---

## Summary

The design is the right shape: layered, composable, and hooks-first. The three biggest items called out in the original review — the StrictMode client-disposal bug, the read-only story, and the `connected.signer` null-ness — all landed. The remaining queue is polish: churn warnings on the remaining providers, concurrent-rendering safety in `useAction`, a handful of small dep-list nits, and the spec↔impl drift items listed above.
