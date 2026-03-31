/**
 * Shared client for all wallet demo examples.
 *
 * A single client instance is created once and shared across the app.
 * The wallet plugin populates client.payer dynamically when connected,
 * falling back to undefined when disconnected (sendTransaction will fail
 * gracefully if called without a connected wallet).
 */
import { createEmptyClient } from '@solana/kit';
import { planAndSendTransactions } from '@solana/kit-plugin-instruction-plan';
import { rpc, rpcTransactionPlanExecutor, rpcTransactionPlanner } from '@solana/kit-plugin-rpc';
import { wallet } from '@solana/kit-plugin-wallet';

export const client = createEmptyClient()
    .use(rpc('https://api.mainnet-beta.solana.com'))
    .use(wallet({ chain: 'solana:localnet' }))
    .use(rpcTransactionPlanner())
    .use(rpcTransactionPlanExecutor())
    .use(planAndSendTransactions());

export type AppClient = typeof client;
