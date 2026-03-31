/**
 * React wallet demo.
 *
 * Demonstrates binding client.wallet state to React using useSyncExternalStore.
 * The client is a module-level singleton — no context provider needed.
 */
import { getTransferSolInstruction } from '@solana-program/system';
import { address, lamports } from '@solana/kit';
import { type WalletStateSnapshot } from '@solana/kit-plugin-wallet';
import { useState, useSyncExternalStore } from 'react';
import { client } from './client';

// Recipient for the demo transfer — in a real app this comes from a form.
const DEMO_RECIPIENT = address('4Nd1mBQtrMJVYVfKf2PX98RQ1VJdTkzEFnQfqXFsqMRC');

/**
 * Bind client.wallet state to React. Compatible with concurrent mode.
 * Returns a referentially stable snapshot — only re-renders when state changes.
 */
function useWalletState(): WalletStateSnapshot {
    return useSyncExternalStore(client.wallet.subscribe, client.wallet.getSnapshot);
}

function WalletList({ wallets }: { wallets: WalletStateSnapshot['wallets'] }) {
    if (wallets.length === 0) {
        return <p>No wallets found. Install a Solana wallet extension.</p>;
    }
    return (
        <ul>
            {wallets.map((w) => (
                <li key={w.name}>
                    <button onClick={() => client.wallet.connect(w)}>{w.name}</button>
                </li>
            ))}
        </ul>
    );
}

function ConnectedView({ connected }: { connected: NonNullable<WalletStateSnapshot['connected']> }) {
    const [pending, setPending] = useState(false);

    async function sendTransfer() {
        const signer = client.wallet.connected?.signer;
        if (!signer) return; // wallet disconnected or read-only between render and click

        setPending(true);
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
            setPending(false);
        }
    }

    return (
        <div>
            <p>
                Connected: <code>{connected.account.address}</code>
            </p>
            {connected.hasSigner ? (
                <button disabled={pending} onClick={sendTransfer}>
                    {pending ? 'Sending…' : 'Send 0.01 SOL'}
                </button>
            ) : (
                <p>Read-only wallet — cannot sign transactions</p>
            )}
            <button onClick={() => client.wallet.disconnect()}>Disconnect</button>
        </div>
    );
}

export function WalletDemo() {
    const { wallets, connected, status } = useWalletState();

    // Render nothing until the plugin has checked storage.
    // This avoids flashing a connect button before auto-reconnect fires.
    if (status === 'pending') return null;

    if (!connected) {
        return (
            <div>
                <h2>Connect a wallet</h2>
                <WalletList wallets={wallets} />
            </div>
        );
    }

    return <ConnectedView connected={connected} />;
}
