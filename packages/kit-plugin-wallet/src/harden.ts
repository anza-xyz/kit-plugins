import {
    bytesEqual,
    compileOffchainMessageV1Envelope,
    getAddressDecoder,
    getOffchainMessageDecoder,
    isSignatureBytes,
    type ReadonlyUint8Array,
    SOLANA_ERROR__WALLET__INVALID_SIGN_IN_OUTPUT,
    SolanaError,
    verifyOffchainMessageEnvelope,
} from '@solana/kit';
import type { SolanaSignInOutput } from '@solana/wallet-standard-features';
import type { Wallet, WalletIcon } from '@wallet-standard/base';
import type { UiWallet, UiWalletAccount } from '@wallet-standard/ui';
import { getWalletForHandle, registerWalletHandle } from '@wallet-standard/ui-registry';

// Hardened copies, keyed by the wallet-ui registry handle they were made from.
// The registry hands back the same handle until something about the
// wallet/account changes, so caching on it keeps the hardened copies
// referentially stable for exactly as long as the registry's are. `null`
// records an account that failed verification, so it isn't re-checked.
const hardenedWallets = new WeakMap<UiWallet, UiWallet>();
const hardenedAccounts = new WeakMap<UiWalletAccount, UiWalletAccount | null>();

// A blank SVG, used in place of a wallet icon that isn't a `data:image/` URI.
const PLACEHOLDER_WALLET_ICON: WalletIcon =
    'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxIDEiLz4=';

/**
 * Returns a copy of a `UiWallet` that is safe to hand to apps, even if the
 * wallet is malicious.
 *
 * Accounts whose `publicKey` doesn't encode their `address` are dropped. The
 * rest are copied once verified, so the wallet can't change them later (e.g.
 * via a `Proxy`). Icons that aren't `data:image/` URIs are dropped from
 * accounts, and replaced with a blank placeholder for the wallet. The copies
 * are registered as handles of the same wallet, so they work with the
 * `@wallet-standard/ui-features` helpers.
 *
 * @param uiWallet - A `UiWallet` handle from the wallet-ui registry.
 * @returns The hardened copy, stable for as long as `uiWallet` is.
 *
 * @internal
 */
export function hardenUiWallet(uiWallet: UiWallet): UiWallet {
    const cached = hardenedWallets.get(uiWallet);
    if (cached) return cached;
    const wallet = getWalletForHandle(uiWallet);
    const { icon } = uiWallet;
    const accounts: UiWalletAccount[] = [];
    for (const account of uiWallet.accounts) {
        const hardened = hardenUiWalletAccount(account, wallet);
        if (hardened) accounts.push(hardened);
    }
    const hardenedWallet = Object.freeze({
        accounts: Object.freeze(accounts),
        chains: Object.freeze([...uiWallet.chains]),
        features: Object.freeze([...uiWallet.features]),
        icon: isImageDataUri(icon) ? icon : PLACEHOLDER_WALLET_ICON,
        name: uiWallet.name,
        version: uiWallet.version,
    }) as UiWallet;
    registerWalletHandle(hardenedWallet, wallet);
    hardenedWallets.set(uiWallet, hardenedWallet);
    return hardenedWallet;
}

function hardenUiWalletAccount(account: UiWalletAccount, wallet: Wallet): UiWalletAccount | null {
    const cached = hardenedAccounts.get(account);
    if (cached !== undefined) return cached;
    // Read each value exactly once, so the values that are verified are the
    // values that are kept.
    const { address, icon, label } = account;
    const publicKey = copyBytes(account.publicKey);
    let hardened: UiWalletAccount | null = null;
    if (publicKey && addressMatchesPublicKey(address, publicKey)) {
        hardened = Object.freeze({
            address,
            chains: Object.freeze([...account.chains]),
            features: Object.freeze([...account.features]),
            // Optional: like the registry, omit the keys when the wallet doesn't
            // provide them, so the copy has the same shape as the handle.
            ...(isImageDataUri(icon) && { icon }),
            ...(label !== undefined && { label }),
            publicKey,
        }) as UiWalletAccount;
        registerWalletHandle(hardened, wallet);
    }
    hardenedAccounts.set(account, hardened);
    return hardened;
}

/**
 * Returns `true` if a wallet-provided public key has exactly the bytes of
 * `expected`.
 *
 * Used to check that an account the wallet returns (e.g. from
 * `solana:signIn`) has the same public key as the hardened account with its
 * address, which is verified to encode that address.
 *
 * @param publicKey - A public key provided by a wallet, which is not trusted to
 *   be a `Uint8Array`.
 * @param expected - The public key of a hardened account.
 * @returns `true` if the bytes are equal.
 *
 * @internal
 */
export function publicKeyMatches(publicKey: unknown, expected: ReadonlyUint8Array): boolean {
    const bytes = copyBytes(publicKey);
    return !!bytes && bytesEqual(bytes, expected);
}

// True if a wallet-provided icon is an image data URI, as the Wallet Standard
// requires. Anything else, such as a remote URL, could be used to track users
// or be unsafe for apps to render.
function isImageDataUri(icon: unknown): icon is WalletIcon {
    return typeof icon === 'string' && icon.startsWith('data:image/');
}

// True if `address` is the base58 encoding of the 32-byte `publicKey`.
function addressMatchesPublicKey(address: string, publicKey: ReadonlyUint8Array): boolean {
    // The decoder reads only the first 32 bytes and throws on fewer, so check
    // the length explicitly.
    if (publicKey.length !== 32) return false;
    return getAddressDecoder().decode(publicKey) === address;
}

/**
 * Copies bytes provided by a wallet, so the wallet can't change them after
 * they are verified.
 *
 * A `Uint8Array` from another realm (e.g. an iframe) is accepted.
 *
 * @param bytes - Bytes provided by a wallet, which are not trusted to be a
 *   `Uint8Array`.
 * @returns A copy of the bytes, or `null` if they aren't a `Uint8Array`.
 *
 * @internal
 */
export function copyBytes(bytes: unknown): ReadonlyUint8Array | null {
    if (!(bytes instanceof Uint8Array || (ArrayBuffer.isView(bytes) && bytes.constructor.name === 'Uint8Array'))) {
        return null;
    }
    return Uint8Array.from(bytes as Uint8Array);
}

/**
 * Verifies the signed message format of a `solana:signIn` output, and the
 * offchain message and signature when the format is an offchain message.
 *
 * The output is treated as a version 1 offchain message when the app requested
 * one (`useOffchainMessage`) or when the wallet reports one in
 * `signedMessageFormat`. Then `signedMessage` must be the canonical encoding of
 * a version 1 offchain message whose only required signer is `address`, and
 * `signature` must be a valid signature of it by `address`. The wallet may
 * leave out `signedMessageFormat`, which is optional, but may not report a
 * different format. The SIWS text inside the message is not checked against
 * the sign-in input; that is left to the app, as for plain sign-in.
 *
 * @param output - The wallet's sign-in output, which is not trusted.
 * @param offchainMessageRequested - Whether the app passed
 *   `useOffchainMessage`.
 * @param address - The address of the account the wallet signed in with,
 *   whose public key is verified to encode it.
 * @param walletName - The wallet's name, for the error context.
 * @returns For an offchain message, copies of the verified `signature` and
 *   `signedMessage` with `signedMessageFormat` set, so the wallet can't change
 *   them afterwards. Otherwise, a frozen snapshot of the `signedMessageFormat`
 *   that was read (if any), so the value returned is the value checked.
 * @throws `SolanaError(SOLANA_ERROR__WALLET__INVALID_SIGN_IN_OUTPUT)` if an
 *   offchain message output fails any check, or if reading the output throws.
 *
 * @internal
 */
export async function verifySignInOutputFormat(
    output: SolanaSignInOutput,
    offchainMessageRequested: boolean,
    address: string,
    walletName: string,
): Promise<SignInOutputFormat> {
    let verified: SignInOutputFormat | null;
    try {
        verified = await readVerifiedSignInOutputFormat(output, offchainMessageRequested, address);
    } catch {
        // A malformed message, or a wallet getter that threw.
        verified = null;
    }
    if (!verified) {
        throw new SolanaError(SOLANA_ERROR__WALLET__INVALID_SIGN_IN_OUTPUT, { address, walletName });
    }
    return verified;
}

type SignInOutputFormat = Partial<Pick<SolanaSignInOutput, 'signature' | 'signedMessage' | 'signedMessageFormat'>>;

// Implements `verifySignInOutputFormat`, returning `null` if a check fails.
async function readVerifiedSignInOutputFormat(
    output: SolanaSignInOutput,
    offchainMessageRequested: boolean,
    address: string,
): Promise<SignInOutputFormat | null> {
    // Read each value exactly once, so the values that are verified are the
    // values that are returned.
    const { signature: walletSignature, signedMessage: walletSignedMessage, signedMessageFormat } = output;
    const kind = signedMessageFormat?.kind;
    const messageVersion = signedMessageFormat?.messageVersion;
    if (!offchainMessageRequested && kind !== 'offchainMessage') {
        // Return a snapshot of the values read, not the wallet's own object,
        // which could report something else when the app reads it. Its kind
        // isn't one the feature defines, so it can't be typed as one.
        if (signedMessageFormat == null) return {};
        const snapshot: unknown = Object.freeze({ kind, messageVersion });
        return { signedMessageFormat: snapshot as SolanaSignInOutput['signedMessageFormat'] };
    }
    // `signedMessageFormat` is optional (a missing or `null` format is
    // accepted), but if present it must match.
    if (signedMessageFormat != null && (kind !== 'offchainMessage' || messageVersion !== 1)) return null;

    const signature = copyBytes(walletSignature);
    const signedMessage = copyBytes(walletSignedMessage);
    if (!signature || !isSignatureBytes(signature) || !signedMessage) return null;
    const message = getOffchainMessageDecoder().decode(signedMessage);
    if (
        message.version !== 1 ||
        message.requiredSignatories.length !== 1 ||
        message.requiredSignatories[0].address !== address
    ) {
        return null;
    }
    // Re-encode and require the exact bytes: Kit's UTF-8 decoder drops null
    // bytes, so the decoded text alone could hide what was signed.
    const { content } = compileOffchainMessageV1Envelope(message);
    if (!bytesEqual(content, signedMessage)) return null;
    // Throws if the signature is invalid.
    await verifyOffchainMessageEnvelope({
        content,
        signatures: { [message.requiredSignatories[0].address]: signature },
    });
    return {
        signature: signature as Uint8Array,
        signedMessage: signedMessage as Uint8Array,
        signedMessageFormat: Object.freeze({ kind: 'offchainMessage', messageVersion: 1 }),
    };
}

/**
 * The earliest version of the `solana:signIn` feature that supports
 * `useOffchainMessage`.
 *
 * @internal
 */
export const OFFCHAIN_SIGN_IN_VERSION = '1.1.0';

/**
 * Returns `true` if a wallet-provided `solana:signIn` feature version supports
 * `useOffchainMessage`: {@link OFFCHAIN_SIGN_IN_VERSION} or a later `1.x`
 * version.
 *
 * @param version - The feature's `version`, which is not trusted to be a
 *   string.
 * @returns `true` if the version supports offchain sign-in.
 *
 * @internal
 */
export function isOffchainSignInVersion(version: unknown): boolean {
    if (typeof version !== 'string') return false;
    const match = /^1\.(\d+)\.\d+$/.exec(version);
    return !!match && Number(match[1]) >= 1;
}
