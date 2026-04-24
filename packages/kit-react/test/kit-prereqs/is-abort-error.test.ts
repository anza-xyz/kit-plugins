import { describe, expect, it } from 'vitest';

import { isAbortError } from '../../src/kit-prereqs';

describe('isAbortError', () => {
    it('recognises DOMException("", "AbortError")', () => {
        expect(isAbortError(new DOMException('Aborted', 'AbortError'))).toBe(true);
    });

    it('recognises errors whose code is ABORT_ERR', () => {
        const err = Object.assign(new Error('aborted'), { code: 'ABORT_ERR' });
        expect(isAbortError(err)).toBe(true);
    });

    it('returns false for other errors', () => {
        expect(isAbortError(new Error('boom'))).toBe(false);
        expect(isAbortError(null)).toBe(false);
        expect(isAbortError(undefined)).toBe(false);
        expect(isAbortError('aborted')).toBe(false);
    });
});
