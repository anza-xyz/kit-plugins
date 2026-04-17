# Second review pass — `@solana/kit-react` + `@solana/kit-react-wallet`

Follow-up to `react-lib-review.md`. The structural issues from that pass (signer hooks reaching for `client.wallet`, package boundary, naming inconsistencies in the spec) are resolved. This pass is shorter and more targeted: DevEx, flexibility, API commitments that will be expensive to change after 1.0, and edge cases that don't show up on the golden path.

Several items below are genuine bugs worth fixing before shipping — those are called out with **🐛**.

Status markers (added after triage): **✅ Done** — addressed in a follow-up commit. **🅿️ Parked** — acknowledged, deferred. **↩️ Withdrawn** — reconsidered and dropped.

---

## 1. DevEx

### Strong

- **First-5-minutes path works.** [kit-react README quickstart](packages/kit-react/README.md) and [kit-react-wallet README](packages/kit-react-wallet/README.md) both land on a runnable snippet in <20 lines. Imports are grouped by package so the split reads naturally.
- **Error messages point at fixes.** `throwMissingCapability` names the missing capability *and* lists the concrete providers that install it ([errors.ts](packages/kit-react/src/internal/errors.ts)). `RpcProvider`'s payer check is the same pattern. This is substantially better than "hook used outside Provider" messages in other libraries.
- **StrictMode-safe plugin churn warning.** `PluginProvider`'s dev-mode detection of unmemoized plugin references ([plugin-provider.tsx:70-88](packages/kit-react/src/providers/plugin-provider.tsx#L70-L88)) is exactly the kind of quiet footgun most libraries ignore. Nice.

### Friction to smooth

- **✅ Done — Discoverability after the split.** A newcomer who knows "I want the connected wallet" will naturally try `import { useConnectedWallet } from '@solana/kit-react'` — and get a confusing TS error ("has no exported member"). Worth a small paragraph in [kit-react README](packages/kit-react/README.md) listing "hooks that live in `kit-react-wallet`" so search-by-symbol lands on an explainer. Even a one-liner in a table at the top of the Hooks section would help.
  - Fixed by adding a "Looking for wallet hooks?" pointer at the top of the Hooks section in kit-react's README, plus the same pointer in the spec's Hooks section.
- **✅ Done — Hook-naming inconsistency in return shapes.** Documented but worth flagging: `useBalance` / `useAccount` / etc. return `{ data, error, isLoading }`; `useSendTransaction` returns `{ send, status, data, error, reset }`; `useConnectWallet` returns a bare function; `usePayer` returns a raw value. Each is justified, but a brief table in the spec's Hooks section (`"returns state" vs "returns function" vs "returns value"`) would help learners build the mental model faster.
  - Fixed by adding a four-category return-shape table (live data / tracked action / bare callback / reactive value) at the top of the spec's Hooks section.
- **🅿️ Parked — No type-level guard on `useClient<T>()`.** The generic is a type assertion — if you forget to wrap in the right provider, you get a TypeScript-clean runtime error. The tradeoff is spelled out in the docstring, but I'd consider a companion hook like `useAssertClient<T>(check: (c: Client) => c is T, hookName: string)` for third-party hook authors who want to front-load the check. Not blocking; future work.
  - Deferred: the type-assertion tradeoff is documented and accepted for now. Revisit if a third-party hook author actually hits this.

---

## 2. Flexibility

Solid across the board — the handful of escape hatches compose well.

- **`useAction`** as the async state primitive is a big win. The [sign-then-send / partial-sign / aggregator flows in the spec](react-lib-spec.md) all reduce to straightforward `useAction` compositions. Stable `send` via ref, latest-wins race semantics, stable `reset` — all there.
- **`PluginProvider` + `useClient<T>()`** gives third-party plugins a complete path to React without shipping their own provider. The DAS example in the spec is realistic.
- **`kit-react-wallet` peer-deps cleanly on `kit-react`.** Adapter authors (MWA, WalletConnect, etc.) now have the right dependency shape to plug in without pulling the full surface.
- **`on<Capability>Change` convention** leaves the door open for other reactive plugins (a rotating-relayer payer, a hot-swappable identity) to participate in the signer hooks without core changes.

Two small gaps:

- **↩️ Withdrawn — No way to disable `useSendTransaction` without calling it.** `useBalance(null)` disables cleanly; `useSendTransaction()` is always active. Users wanting to conditionally skip transaction machinery (e.g. "only mount sending when a wallet is connected") currently have to split components. Probably fine — worth a one-liner in the docs acknowledging this.
  - On reflection, `useSendTransaction` doesn't actually do anything at render time other than set up `useState`/`useRef`/`useCallback` scaffolding — no subscriptions, no requests. There's nothing to "disable". Only render-time cost is the capability check, same as any capability-gated hook. Point withdrawn.
- **✅ Done — `useLiveQuery`'s `config` / `deps` split is a footgun.** The docstring correctly warns "any value `config` closes over must appear in `deps`", but the pattern is ergonomically worse than a factory function that captures directly. Consider a variant `useLiveQuery((signal) => createReactiveStore…, [deps])` as an alternative signature — matches `useSubscription`'s shape, no captured-variable invisible dependency.
  - Fixed by changing `useLiveQuery`'s signature from `(config, deps)` to `(factory, deps)` where `factory` is a function returning the config. ESLint's `react-hooks/exhaustive-deps` can now trace the factory body and warn about missing deps. Also enabled the `react-hooks` lint rule at the workspace level (it was imported but not actually running) and added `useLiveQuery`, `useLiveStore`, and `useSubscription` to the `additionalHooks` pattern.

---

## 3. Commitments worth pressure-testing before 1.0

These are API contracts that are cheap to change now and expensive after release.

### ✅ Done — `onPayerChange` naming

Reads like a React event-handler prop (`onChange`, `onClick`) but is actually a subscribe-registration function that returns an unsubscribe. Chrome's `chrome.storage.onChanged.addListener(cb)` uses a similar-looking name but with explicit `.addListener` — ours is directly callable (`client.onPayerChange(cb)`). Same for `onIdentityChange`.

Alternatives:

- `subscribeToPayer(cb)` / `subscribeToIdentity(cb)` — verb-first, matches `client.wallet.subscribe(cb)`'s shape.
- `payer.subscribe(cb)` / `identity.subscribe(cb)` — method on a namespace object. Cleanest but requires the capability to be an object, which `client.payer` isn't today (it's a `TransactionSigner` value).
- Keep `onPayerChange` but add a type alias like `PayerChangeSubscriber` so the argument name at call sites clarifies intent.

I'd lean `subscribeToPayer` — it's less cute than `onPayerChange` but reads unambiguously. Low-cost change now; a forever name after release.

> Renamed to `subscribeToPayer` / `subscribeToIdentity` across the wallet plugin, kit-react signer hooks, tests, docs, and changesets. The convention section in the spec and both READMEs now use the new names.

### 🅿️ Parked — `useClient<T>()` and `useChain<T>()` as type assertions

Documented as intentional escape hatches. The risk: a third-party library author gets the generic wrong, ships, and users see "cannot read property 'foo' of undefined" at runtime with no guidance. Consider adding (in a follow-up) an optional runtime-checker companion: `useClient<T>(check?: (c: object) => c is T)`. Default: today's behavior. Opted-in: runtime validation that surfaces a capability error.

> Same concern as the parked item in section 1. Deferred for both `useClient` and `useChain` — the type-assertion tradeoff is documented and accepted for now.

### ✅ Acknowledged — Hook return-shape variance

- Live-data: `{ data, error, isLoading }` (read-only reactive)
- Action (single `send`): `{ send, status, data, error, reset }` (call + reactive state)
- Action (bare fn): `(args) => Promise<result>` (no state tracking)
- Value: `TransactionSigner | null` (read-only reactive)

Each return shape maps to a distinct semantic class, but you commit to "live-data always returns object with `isLoading`, signer hooks always return raw value" forever. Worth a last sanity check: is there a case where a future signer hook would want `isLoading` (e.g. while the wallet plugin is reconnecting)? If so, unifying toward `{ data, error, isLoading }` now would be cheaper than deprecating `usePayer`'s shape later.

Counter-argument: `null`-for-"not-available" is simpler, and `isLoading` for a signer is weird (it's not fetching). Probably fine as-is — just worth checking.

> Confirmed fine as-is. Each return shape maps to a distinct semantic class (live data → fetches, tracked action → async lifecycle, bare callback → fire-and-forget, reactive value → read-only state). The spec's new return-shape table at the top of the Hooks section captures this for learners.

### 🟢 `LiveQueryResult<T>` shape is stable

`{ data, error, isLoading }` is the industry-standard shape (react-query, SWR, Apollo). No action needed.

---

## 4. Edge cases & bugs

### ✅ Done — `usePayer` / `useIdentity` break SSR

[`signers.ts:67`](packages/kit-react/src/hooks/signers.ts#L67) and [`signers.ts:104`](packages/kit-react/src/hooks/signers.ts#L104) call `useSyncExternalStore` with only two arguments. The third argument (`getServerSnapshot`) is **required** during server render — omitting it throws:

> Error: Missing getServerSnapshot, which is required for server-rendered content.

`useLiveQueryResult` gets this right — it passes `getState` as both the client and server snapshot ([live-store.ts:108-109](packages/kit-react/src/internal/live-store.ts#L108-L109)). The signer hooks should do the same:

```ts
const payer = useSyncExternalStore(
    client.onPayerChange ?? NOOP_SUBSCRIBE,
    () => readOptional(() => client.payer),
    () => readOptional(() => client.payer),  // add this
);
```

This is a regression against the spec's "SSR-safe by default" claim. The test suite doesn't catch it because `signers.test.tsx` is gated on `__BROWSER__ || __REACTNATIVE__`. Worth adding an SSR-only test (`node` project) that asserts the hook renders without throwing and returns `null`.

> Both hooks now pass `getSnapshot` as the third argument (`getServerSnapshot`) — the static read works identically on server and client. Added a node-only describe block in `signers.test.tsx` that uses `renderToString` to verify: static signer renders, unreachable (throwing) payer renders as `null`, and the same for `useIdentity`. Added `@types/react-dom` to kit-react's devDependencies.

### ✅ Done — `useBalance(null)` has `isLoading: true`, but docstring says `false`

[`use-balance.ts:20-21`](packages/kit-react/src/hooks/use-balance.ts#L20-L21) docstring:

> Pass `null` to disable the query … The hook remains mounted with `data` and `error` both `undefined` and `isLoading` **false**.

But `useLiveQueryResult` computes `isLoading = state === undefined && error === undefined` ([live-store.ts:114](packages/kit-react/src/internal/live-store.ts#L114)), and `nullLiveStore.getState()` always returns `undefined`. So a disabled query reports `isLoading: true` forever.

Users will write `if (isLoading) return <Spinner />` and get a spinner that never goes away when the address is null. Options:

1. Fix `useLiveQueryResult` to detect the null-store case: expose a sentinel / flag on the store, or have `nullLiveStore` return a synthetic "disabled" state.
2. Change the docstring to match the behavior (and update `useAccount`, `useTransactionConfirmation` too) — then warn users to gate on `address != null` explicitly.

I'd fix the behavior (option 1) — "disabled means not loading" is the user expectation, and matches SWR/react-query semantics when a key is `null`.

> Split `nullLiveStore` into two helpers: `nullLiveStore()` (used internally by `useLiveStore` on SSR, reports `isLoading: true`) and `disabledLiveStore()` (used by named hooks when an address / signature is `null`, branded with a symbol the hook result reader checks to report `isLoading: false`). This keeps SSR's loading-state intact (so hydration stays deterministic) while fixing disabled-query semantics. Updated the docstrings on `useBalance`, `useAccount`, and `useTransactionConfirmation` to match.

### ✅ Done — `KitClientProvider` double-disposes owned client in StrictMode

[`client-context.tsx:199-212`](packages/kit-react/src/client-context.tsx#L199-L212). React 18 StrictMode runs effects twice in dev (mount → cleanup → mount again → eventual real cleanup). The `ownedClient` is stored in `useState`'s lazy init and persists across the fake remount. Sequence:

1. Mount → effect runs → cleanup scheduled.
2. Strict fake unmount → cleanup runs → `disposeClient(ownedClient)`.
3. Strict fake remount → effect runs on the **same disposed client**.
4. Real unmount → cleanup runs → `disposeClient(ownedClient)` again.

If the underlying Kit client's `[Symbol.dispose]` isn't idempotent (most disposables aren't), the second call throws, and the whole subtree uses a disposed client between steps 3-4.

Fixes:

- Make `disposeClient` idempotent via a `WeakSet<object>` of disposed clients (small, bounded).
- Or: recreate the client on effect re-run (breaks identity — more invasive).

Option 1 is minimal and safe. Easy to verify with a StrictMode test.

> `disposeClient` now uses a `WeakSet<object>` of disposed clients to short-circuit subsequent calls for the same client. Added two tests: a `<StrictMode>` mount + unmount of `KitClientProvider` that asserts no throw, and a unit test for `disposeClient` itself (three consecutive calls → underlying dispose fires once; no-op for clients without `Symbol.dispose`).

### ✅ Done — `WalletProvider`: unmemoized `filter` prop tears down wallet state each render

[`wallet-provider.tsx:110-124`](packages/kit-react-wallet/src/wallet-provider.tsx#L110-L124): the plugin is rebuilt when any of `[role, chain, autoConnect, storage, storageKey, filter]` change. `filter` is a function — if the caller passes an inline `filter={w => …}`, a fresh identity on every render rebuilds the plugin, which re-creates the wallet store, which re-runs discovery and reconnect.

`PluginProvider` has a dev-mode warning for this exact pattern ([plugin-provider.tsx:80](packages/kit-react/src/providers/plugin-provider.tsx#L80)). `WalletProvider` inherits it indirectly — since it wraps `PluginProvider` with its own `useMemo`'d plugin — so *it should* surface the warning. Worth verifying in a test: does a churning `filter` prop trip the PluginProvider warning?

If not, add a similar warning inside `WalletProvider`'s `useMemo` dep list, or document loudly that `filter` must be stable.

> Added a dev-only churn warning inside `WalletProvider` that compares `filter` / `storage` / `storageKey` prop identities across renders (matching `PluginProvider`'s threshold-of-2 pattern, so legitimate one-off changes don't trip). The warning names the specific prop that's churning, so users see actionable guidance instead of the misleading `<PluginProvider>` warning. Also added a "Prop identity matters" section to the `WalletProvider` docstring with a hoisted-filter example, and two tests (`wallet-provider.test.tsx`) that verify the warning fires on inline filter churn and stays silent for stable references.

### ✅ Done — `useAction`'s `send` rethrows even when state update is skipped

[`use-action.ts:83`](packages/kit-react/src/hooks/use-action.ts#L83): if a stale in-flight call rejects, `setState` is skipped (good) — but `throw error` still runs (line 83). A caller doing `await send(...)` on the old call gets the rejection, even though the UI has moved on.

Usually fine: the caller's `await` is awaiting the old promise, which should reject with the old error. But it's worth documenting: "If you fire multiple `send`s, earlier awaits still reject with their own errors; only the UI state reflects the latest." The spec and docstring don't currently make this clear.

> Replaced the requestId tracking with per-send `AbortController`s and `getAbortablePromise` (from `@solana/kit`). A new `send` aborts the prior call: stale awaits reject with a standard `AbortError` instead of the underlying success/error, and state is only written for the non-aborted call. Same for `reset()` — it now aborts any in-flight call to prevent a slow rejection from flipping state out of idle. The wrapped `fn` receives the `AbortSignal` as its first arg, so callers can thread it into `fetch` / RPC options for true cancellation (not just the outer await bailing). `useSendTransaction` and `useSendTransactions` automatically benefit — the signal is plumbed into `client.sendTransaction(input, { abortSignal, ... })`, which the instruction-plan plugin already honors via `throwIfAborted()` checkpoints. README and spec updated with the new example shapes and the `if ((err as Error).name === 'AbortError') return` caller pattern.

### 🟢 Everything else in the SSR / lifecycle path looks good

- `useLiveStore` dead-code-eliminates the factory on server builds via `!__BROWSER__ && !__REACTNATIVE__` — clean.
- `useSubscription` resets state on dep change before re-running factory.
- `useLiveQueryResult` passes `getServerSnapshot`.
- `ChainContext` is just a value — no SSR concerns.

---

## 5. Polish / nits

- **✅ Done — Spec drift on `isLoading` semantics.** Same issue as the bug above: the spec's Live-data hooks section doesn't describe disabled-query behavior. Whichever fix you pick, sync the spec.
  - `LiveQueryResult<T>`'s `isLoading` docstring now explicitly calls out the disabled-query case; the named hooks' docstrings in the spec mention it too; and a new "Disabled vs. loading vs. server render" subsection lists all three states with their `isLoading` values side by side.
- **🅿️ Parked — Signer hooks reference `useConnectedWallet` via backticks** (no `@link`) since it's cross-package. Technically correct but creates a minor DX gap: no IDE "go to definition" for the reference. Not fixable without cross-package typedoc config. Fine for now.
- **✅ Done — `kit-react-wallet` README doesn't mention the dev-mode churn warning** for `filter` / `storage` / `storageKey`. Worth a "Gotchas" section.
  - Added a `## Gotchas` section to the README covering (1) prop-identity stability for `filter` / `storage` / `storageKey` with ✅ hoist / ✅ `useMemo` / ❌ inline-arrow examples, and (2) the "don't double-install a wallet plugin" case for pre-built-client setups. Both reference the dev-mode warnings so users who hit either one can find the explanation.
- **✅ Done — `useWalletState()` is currently the only hook that returns the full wallet snapshot.** After the wallet-adapter comparison ("useWalletState is the escape hatch for one-object"), the spec implicitly promotes it. The wallet-state README doesn't quite highlight this — a one-liner noting "prefer focused hooks; reach for useWalletState when you want the one-object shape" would help.
  - Added a "Prefer the focused hooks" paragraph to the State hooks section of the kit-react-wallet README explaining when to reach for `useWalletState()` vs the granular trio.
- **✅ Acknowledged — Changeset entries** are accurate and well-scoped. The `@solana/kit-react` entry correctly lists what's in core post-split.

---

## Suggested priority

**Ship-blocking:** ~~Three bugs above (`usePayer` SSR, `isLoading` on disabled, StrictMode double-dispose).~~ All three fixed + tests — see per-item notes.

**Before 1.0, not blocking:** ~~`onPayerChange` naming decision~~ (renamed to `subscribeTo*`), ~~filter-prop churn warning/docs~~ (warning + test + docs added), ~~disabled-query spec sync~~ (spec now has explicit "disabled vs. loading vs. server render" semantics).

**Future:** Runtime-checked `useClient<T>()` (🅿️), cross-package IDE linking (🅿️).

**✅ Addressed in follow-ups:** split-discoverability README pointer, hook-return-shape table in spec, `useLiveQuery` factory signature + workspace-level `react-hooks` lint enablement, `subscribeToPayer` / `subscribeToIdentity` rename, `usePayer` / `useIdentity` SSR fix + node-only tests, disabled-query `isLoading: false` semantics via branded `disabledLiveStore`, idempotent `disposeClient` + StrictMode test, `useAction` abort semantics via `AbortController` + `getAbortablePromise` (signal-first fn arg, signal threaded through `useSendTransaction(s)`), `WalletProvider` prop-churn warning + docs + tests, kit-react-wallet README Gotchas section + focused-hooks guidance.

Overall: the design is landing well. The `on<Capability>Change` convention + the package split have cleaned up the architectural smells; what's left is SSR hardening, a couple of state-machine edge cases, and a naming pressure-test.
