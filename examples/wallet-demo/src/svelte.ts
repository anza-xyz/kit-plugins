/**
 * Svelte wallet demo.
 *
 * Demonstrates binding client.wallet state to Svelte using a readable store.
 *
 * Component usage (WalletDemo.svelte):
 *
 * ```svelte
 * <script lang="ts">
 *   import { walletState, connect, disconnect, sendTransfer, pending } from './svelte';
 *   // $walletState auto-subscribes and unsubscribes with the component lifecycle
 * </script>
 *
 * {#if $walletState.status !== 'pending'}
 *   {#if !$walletState.connected}
 *     <h2>Connect a wallet</h2>
 *     {#if $walletState.wallets.length === 0}
 *       <p>No wallets found. Install a Solana wallet extension.</p>
 *     {:else}
 *       {#each $walletState.wallets as w (w.name)}
 *         <button on:click={() => connect(w)}>{w.name}</button>
 *       {/each}
 *     {/if}
 *   {:else}
 *     <p>Connected: <code>{$walletState.connected.account.address}</code></p>
 *     {#if !$walletState.connected.signer}
 *       <p>Read-only wallet — cannot sign transactions</p>
 *     {:else}
 *       <button disabled={$pending} on:click={sendTransfer}>
 *         {$pending ? 'Sending…' : 'Send 0.01 SOL'}
 *       </button>
 *     {/if}
 *     <button on:click={disconnect}>Disconnect</button>
 *   {/if}
 * {/if}
 * ```
 */
import { getTransferSolInstruction } from '@solana-program/system';
import { address, lamports } from '@solana/kit';
import { readable, writable } from 'svelte/store';
import { client } from './client';

// Recipient for the demo transfer — in a real app this comes from a form.
const DEMO_RECIPIENT = address('4Nd1mBQtrMJVYVfKf2PX98RQ1VJdTkzEFnQfqXFsqMRC');

/**
 * Svelte readable store wrapping client.wallet state.
 * Subscribes to the wallet plugin and emits a new snapshot on every change.
 * Automatically unsubscribes when all Svelte subscribers are gone.
 */
export const walletState = readable(client.wallet.getSnapshot(), (set) => {
    return client.wallet.subscribe(() => set(client.wallet.getSnapshot()));
});

export const pending = writable(false);

export function connect(w: Parameters<typeof client.wallet.connect>[0]) {
    client.wallet.connect(w);
}

export function disconnect() {
    client.wallet.disconnect();
}

export async function sendTransfer() {
    const signer = client.wallet.getSnapshot().connected?.signer;
    if (!signer) return; // wallet disconnected or read-only between render and click

    pending.set(true);
    try {
        await client.sendTransaction(
            getTransferSolInstruction({
                source: signer,
                destination: DEMO_RECIPIENT,
                amount: lamports(10_000_000n), // 0.01 SOL
            }),
        );
        alert('Transfer sent!');
    } catch (e) {
        console.error(e);
        alert('Transfer failed. See console for details.');
    } finally {
        pending.set(false);
    }
}
