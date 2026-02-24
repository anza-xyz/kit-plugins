---
name: docblocks
description: Add missing JSDoc docblocks to exported symbols in the repository
argument-hint: '[path] [--all]'
---

# Add Missing Docblocks

Scan the specified path (or entire repository if no path given) and add missing docblocks to all exported functions, classes, interfaces, types, and constants.

## Arguments

- `$1` (optional): Path to narrow the scope (e.g. `src/utils` or `packages/kit-plugin-rpc/src`).
- `$2` (optional): Use `--all` flag to include non-exported items.

## Docblock Style Guidelines

Use JSDoc format with the following conventions:

- Start with `/**` on its own line.
- Use `*` prefix for each line.
- End with `*/` on its own line.
- Keep descriptions concise but complete.
- Start your sentences with a capital letter and end with a period.
- Limit your usage of em dashes but, when you do use them, use spaces on both sides.
- Begin with a clear one or two line summary (no `@summary` tag needed).
- Add a blank line after the summary if adding more details.
- Include `@param` tags for all parameters.
- Include `@typeParam` tags for all type parameters. Use `@typeParam`, not `@template`.
- Include `@return` tag briefly describing the return value.
- Add `@throws` for functions that may throw errors and list these errors.
- Include at least one `@example` section whenever usage examples would be helpful. If the file is a TypeScript file, use TypeScript syntax in examples. Try to make the examples realistic but concise and pleasant to read. They must illustrate the concepts clearly at first glance. When more than one example is preferred, use multiple `@example` tags and keep the first one as simple as possible to illustrate the basic usage. Never use `any` type in examples. Display the `import` statements required for the example to work when imports from multiple libraries are required. It is acceptable to use placeholder variable names like `myUser` or even `/* ... */` for parts that are not relevant to the example. When multiple example sections are provided, add a brief description before each code block to quickly explain what the example illustrates.
- In the rare case where more advanced documentation is also needed for the item, use the `@remarks` tag to add this extra information after any example sections. These remarks can include longer explanations and even additional code blocks if necessary.
- When an item is deprecated, include a `@deprecated` tag with a brief explanation and, if applicable, suggest an alternative.
- Use `{@link ...}` tags to reference other items in the codebase when relevant.
- Add `@see` tags at the very end when applicable to point to other related items or documentation. Use `@see {@link ...}` format when linking to other code items.

## Examples of Good Docblocks

````ts
/**
 * Sets the provided `TransactionSigner` as the `payer` property on the client.
 *
 * @param payer - The `TransactionSigner` to set as the payer.
 *
 * @example
 * ```ts
 * import { createEmptyClient } from '@solana/kit';
 * import { payer } from '@solana/kit-plugins';
 *
 * // Install the payer plugin with your signer.
 * const client = createEmptyClient().use(payer(mySigner));
 *
 * // Use the payer in your client.
 * console.log(client.payer.address);
 * setTransactionFeePayerSigner(client.payer, transactionMessage);
 * ```
 */
export function payer(payer: TransactionSigner) {
    return <T extends object>(client: T) => ({ ...client, payer });
}
````

````ts
/**
 * Fixes a `Uint8Array` to the specified length.
 *
 * If the array is longer than the specified length, it is truncated.
 * If the array is shorter than the specified length, it is padded with zeroes.
 *
 * @param bytes - The byte array to truncate or pad.
 * @param length - The desired length of the byte array.
 * @return The byte array truncated or padded to the desired length.
 *
 * @example
 * Truncates the byte array to the desired length.
 * ```ts
 * const bytes = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
 * const fixedBytes = fixBytes(bytes, 2);
 * //    ^ [0x01, 0x02]
 * ```
 *
 * @example
 * Adds zeroes to the end of the byte array to reach the desired length.
 * ```ts
 * const bytes = new Uint8Array([0x01, 0x02]);
 * const fixedBytes = fixBytes(bytes, 4);
 * //    ^ [0x01, 0x02, 0x00, 0x00]
 * ```
 */
export const fixBytes = (bytes: ReadonlyUint8Array | Uint8Array, length: number): ReadonlyUint8Array | Uint8Array =>
    padBytes(bytes.length <= length ? bytes : bytes.slice(0, length), length);
````

````ts
/**
 * A set of instructions with constraints on how they can be executed.
 *
 * This is structured as a recursive tree of plans in order to allow for
 * parallel execution, sequential execution and combinations of both.
 *
 * Namely the following plans are supported:
 * - {@link SingleInstructionPlan} - A plan that contains a single instruction.
 * - {@link ParallelInstructionPlan} - A plan that contains other plans that
 *   can be executed in parallel.
 * - {@link SequentialInstructionPlan} - A plan that contains other plans that
 *   must be executed sequentially.
 * - {@link MessagePackerInstructionPlan} - A plan that can dynamically pack
 *   instructions into transaction messages.
 *
 * @example
 * ```ts
 * const myInstructionPlan: InstructionPlan = parallelInstructionPlan([
 *    sequentialInstructionPlan([instructionA, instructionB]),
 *    instructionC,
 *    instructionD,
 * ]);
 * ```
 *
 * @see {@link SingleInstructionPlan}
 * @see {@link ParallelInstructionPlan}
 * @see {@link SequentialInstructionPlan}
 * @see {@link MessagePackerInstructionPlan}
 */
export type InstructionPlan =
    | MessagePackerInstructionPlan
    | ParallelInstructionPlan
    | SequentialInstructionPlan
    | SingleInstructionPlan;
````

## Process

1. If `$1` is provided, scan only that path; otherwise scan the entire repository.
2. Look for TypeScript/JavaScript files (`.ts`, `.tsx`, `.js`, `.jsx`).
3. Identify exported items without docblocks:
    - `export function`
    - `export class`
    - `export interface`
    - `export type`
    - `export const` (for constants and arrow functions)
4. If `$2` equals `--all`, also identify non-exported items.
5. Do not modify real code outside of docblocks! Do not modify existing docblocks!
6. For each item missing a docblock:
    - Analyze the code to understand its purpose (this may span multiple files).
    - Examine parameters, return types, and behavior.
    - Generate an appropriate docblock following the style guide.
7. Present all changes clearly, grouped by file. Apply all changes without requiring further approval.
