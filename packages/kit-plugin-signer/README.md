# Kit Plugins ➤ Signer

[![npm][npm-image]][npm-url]
[![npm-downloads][npm-downloads-image]][npm-url]

[npm-downloads-image]: https://img.shields.io/npm/dm/@solana/kit-plugin-signer.svg?style=flat
[npm-image]: https://img.shields.io/npm/v/@solana/kit-plugin-signer.svg?style=flat&label=%40solana%2Fkit-plugin-signer
[npm-url]: https://www.npmjs.com/package/@solana/kit-plugin-signer

This package offers plugins that set up the `payer` and `identity` signers on your Kit clients. Each plugin comes in three variants so you can set only the `payer`, only the `identity`, or both at once.

## Installation

```sh
pnpm install @solana/kit-plugin-signer
```

## Payer vs Identity

Kit clients can hold two distinct signer roles:

- **`payer`** — the signer responsible for paying transaction fees and storage costs (i.e. the minimum balance required to keep newly created accounts alive based on their size).
- **`identity`** — the signer representing the wallet that owns things in the application, such as the authority over accounts, tokens, or other on-chain assets.

In many cases both roles are filled by the same keypair. Every plugin in this package therefore comes in three variants:

| Variant     | Sets                                          |
| ----------- | --------------------------------------------- |
| `signer*`   | Both `payer` **and** `identity` (same signer) |
| `payer*`    | Only `payer`                                  |
| `identity*` | Only `identity`                               |

For instance, `signer(mySigner)` is a shorthand for using both `payer(mySigner)` and `identity(mySigner)`.

## `signer` / `payer` / `identity` plugins

These plugins accept an existing `TransactionSigner` and install it on the client.

```ts
import { createClient } from '@solana/kit';
import { signer } from '@solana/kit-plugin-signer';

const client = createClient().use(signer(mySigner));
```

Use `payer(mySigner)` or `identity(mySigner)` to set only one role.

## `generatedSigner` / `generatedPayer` / `generatedIdentity` plugins

These asynchronous plugins generate a new random `KeyPairSigner` and install it on the client.

```ts
import { createClient } from '@solana/kit';
import { generatedSigner } from '@solana/kit-plugin-signer';

const client = await createClient().use(generatedSigner());
```

Use `generatedPayer()` or `generatedIdentity()` to generate a signer for only one role.

## `generatedSignerWithSol` / `generatedPayerWithSol` / `generatedIdentityWithSol` plugins

These asynchronous plugins generate a new random `KeyPairSigner`, airdrop some SOL to it, and install it on the client. They require an airdrop function to already be available on the client (e.g. via `rpcAirdrop` or `litesvmAirdrop`).

```ts
import { createClient, lamports } from '@solana/kit';
import { rpcAirdrop, solanaRpcConnection, solanaRpcSubscriptionsConnection } from '@solana/kit-plugin-rpc';
import { generatedSignerWithSol } from '@solana/kit-plugin-signer';

const client = await createClient()
    .use(solanaRpcConnection('http://127.0.0.1:8899'))
    .use(solanaRpcSubscriptionsConnection('ws://127.0.0.1:8900'))
    .use(rpcAirdrop())
    .use(generatedSignerWithSol(lamports(10_000_000_000n)));
```

Use `generatedPayerWithSol(amount)` or `generatedIdentityWithSol(amount)` to target only one role.

## `airdropSigner` / `airdropPayer` / `airdropIdentity` plugins

These plugins airdrop SOL to a signer that is already installed on the client. They are particularly useful when the airdrop function is provided by a plugin that requires a signer to already be installed on the client. For instance, `solanaLocalRpc` bundles an airdrop function but requires a `payer` to be set first. In that case, you can generate the signer first, then install the RPC plugin, and then use `airdropSigner` to fund the signer after the fact.

```ts
import { createClient, lamports } from '@solana/kit';
import { solanaLocalRpc } from '@solana/kit-plugin-rpc';
import { generatedSigner, airdropSigner } from '@solana/kit-plugin-signer';

const client = await createClient()
    .use(generatedSigner())
    .use(solanaLocalRpc())
    .use(airdropSigner(lamports(1_000_000_000n)));
```

Use `airdropPayer(amount)` or `airdropIdentity(amount)` to target only one role. Note that `airdropSigner(amount)` will throw if the `payer` and `identity` on the client are not the same signer.

## `signerFromFile` / `payerFromFile` / `identityFromFile` plugins

These plugins load a `KeyPairSigner` from a local JSON keypair file and install it on the client. Node.js only — other environments will throw an error.

```ts
import { createClient } from '@solana/kit';
import { signerFromFile } from '@solana/kit-plugin-signer';

const client = await createClient().use(signerFromFile('~/.config/solana/id.json'));
```

Use `payerFromFile(path)` or `identityFromFile(path)` to load a signer for only one role.
