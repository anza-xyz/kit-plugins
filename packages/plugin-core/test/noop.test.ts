import { expect, test } from 'vitest';

import { createEmptyClient } from '../src';

test('it exports a function', () => {
    expect(createEmptyClient).toBeTypeOf('function');
});
