# `kit-prereqs/` — temporary shims

Every file in this folder is a **temporary** shim for a Kit or kit-plugins
primitive that this library depends on but which has not yet shipped upstream.
Each file is marked `TODO(move-to-kit)` or `TODO(move-to-kit-plugins)` and
links to the upstream PR.

When the upstream PR lands, delete the file from this folder and flip the
corresponding import in `../` to the upstream package. The public surface of
`@solana/kit-react` is spec-native, so consumers of this library never see the
shim and no breaking change is required on deletion.

| Shim                          | Upstream                                              |
| ----------------------------- | ----------------------------------------------------- |
| `reactive-stream-store.ts`    | [kit#1552](https://github.com/anza-xyz/kit/pull/1552) |
| `reactive-action-store.ts`    | [kit#1550](https://github.com/anza-xyz/kit/pull/1550) |
| `pending-rpc-subs-request.ts` | [kit#1553](https://github.com/anza-xyz/kit/pull/1553) |
| `pending-rpc-request.ts`      | [kit#1555](https://github.com/anza-xyz/kit/pull/1555) |
| `is-abort-error.ts`           | Merged into Kit; awaiting release                     |
