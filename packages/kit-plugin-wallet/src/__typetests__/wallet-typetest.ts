import { type ClientWithIdentity, type ClientWithPayer, createClient, TransactionSigner } from '@solana/kit';
import type { ClientWithSubscribeToIdentity, ClientWithSubscribeToPayer } from '@solana/kit-plugin-signer';

import { ClientWithWallet } from '../types';
import { walletIdentity, walletPayer, walletSigner, walletWithoutSigner } from '../wallet';

const config = { chain: 'solana:mainnet' as const };

const signer = null as unknown as TransactionSigner;

// [DESCRIBE] walletSigner
{
    // It sets payer, identity, and wallet on the client.
    {
        const client = createClient().use(walletSigner(config));
        client.payer satisfies ClientWithPayer['payer'];
        client.identity satisfies ClientWithIdentity['identity'];
        client.wallet satisfies ClientWithWallet['wallet'];
    }
    // It advertises both `subscribeToPayer` and `subscribeToIdentity`.
    {
        const client = createClient().use(walletSigner(config));
        client.subscribeToPayer satisfies ClientWithSubscribeToPayer['subscribeToPayer'];
        client.subscribeToIdentity satisfies ClientWithSubscribeToIdentity['subscribeToIdentity'];
    }
}

// [DESCRIBE] walletPayer
{
    // It sets payer and wallet on the client.
    {
        const client = createClient().use(walletPayer(config));
        client.payer satisfies ClientWithPayer['payer'];
        client.wallet satisfies ClientWithWallet['wallet'];
    }
    // It advertises `subscribeToPayer` but not `subscribeToIdentity`.
    {
        const client = createClient().use(walletPayer(config));
        client.subscribeToPayer satisfies ClientWithSubscribeToPayer['subscribeToPayer'];
        // @ts-expect-error walletPayer does not install subscribeToIdentity.
        void client.subscribeToIdentity;
    }
    // It does not strip a previously-set identity.
    {
        const base = { identity: signer } as unknown as ClientWithIdentity;
        const result = walletPayer(config)(base);
        result.identity satisfies TransactionSigner;
    }
}

// [DESCRIBE] walletIdentity
{
    // It sets identity and wallet on the client.
    {
        const client = createClient().use(walletIdentity(config));
        client.identity satisfies ClientWithIdentity['identity'];
        client.wallet satisfies ClientWithWallet['wallet'];
    }
    // It advertises `subscribeToIdentity` but not `subscribeToPayer`.
    {
        const client = createClient().use(walletIdentity(config));
        client.subscribeToIdentity satisfies ClientWithSubscribeToIdentity['subscribeToIdentity'];
        // @ts-expect-error walletIdentity does not install subscribeToPayer.
        void client.subscribeToPayer;
    }
    // It does not strip a previously-set payer.
    {
        const base = { payer: signer } as unknown as ClientWithPayer;
        const result = walletIdentity(config)(base);
        result.payer satisfies TransactionSigner;
    }
}

// [DESCRIBE] walletWithoutSigner
{
    // It sets wallet on the client.
    {
        const client = createClient().use(walletWithoutSigner(config));
        client.wallet satisfies ClientWithWallet['wallet'];
    }
    // It installs neither `subscribeToPayer` nor `subscribeToIdentity`.
    {
        const client = createClient().use(walletWithoutSigner(config));
        // @ts-expect-error walletWithoutSigner does not install subscribeToPayer.
        void client.subscribeToPayer;
        // @ts-expect-error walletWithoutSigner does not install subscribeToIdentity.
        void client.subscribeToIdentity;
    }
    // It does not strip a previously-set payer.
    {
        const base = { payer: signer } as unknown as ClientWithPayer;
        const result = walletWithoutSigner(config)(base);
        result.payer satisfies TransactionSigner;
    }
    // It does not strip a previously-set identity.
    {
        const base = { identity: signer } as unknown as ClientWithIdentity;
        const result = walletWithoutSigner(config)(base);
        result.identity satisfies TransactionSigner;
    }
    // It does not strip a previously-set payer and identity.
    {
        const base = { identity: signer, payer: signer } as unknown as ClientWithIdentity & ClientWithPayer;
        const result = walletWithoutSigner(config)(base);
        result.payer satisfies TransactionSigner;
        result.identity satisfies TransactionSigner;
    }
}

// [DESCRIBE] Only one wallet plugin allowed
{
    // It fails to typecheck when a wallet plugin is used on a client that already has wallet.
    {
        const client = createClient().use(walletSigner(config));
        // @ts-expect-error Cannot use a second wallet plugin.
        walletSigner(config)(client);
        // @ts-expect-error Cannot use a second wallet plugin.
        walletPayer(config)(client);
        // @ts-expect-error Cannot use a second wallet plugin.
        walletIdentity(config)(client);
        // @ts-expect-error Cannot use a second wallet plugin.
        walletWithoutSigner(config)(client);
    }
}
