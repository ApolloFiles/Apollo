import Crypto from 'node:crypto';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import CsrfTokenValidator from '../../../src/auth/CsrfTokenValidator.js';

const TOKEN = 'HR7dQpZ2mKf0aVxLnB4tYs1';

describe('CsrfTokenValidator#validate', () => {
  let validator: CsrfTokenValidator;

  beforeEach(() => {
    validator = new CsrfTokenValidator();
  });

  test('Accepts two identical tokens', () => {
    expect(validator.validate(TOKEN, TOKEN)).toBe(true);
    expect(validator.validate(TOKEN, `${TOKEN}`)).toBe(true);
  });

  test('Rejects tokens that differ in a single character', () => {
    expect(validator.validate(TOKEN, `${TOKEN.slice(0, -1)}X`)).toBe(false);
    expect(validator.validate(`X${TOKEN.slice(1)}`, TOKEN)).toBe(false);
  });

  test('Is case-sensitive', () => {
    expect(validator.validate(TOKEN.toLowerCase(), TOKEN.toUpperCase())).toBe(false);
  });

  test('Rejects tokens of different length instead of throwing', () => {
    expect(validator.validate(TOKEN, `${TOKEN}extra`)).toBe(false);
    expect(validator.validate(`${TOKEN}extra`, TOKEN)).toBe(false);
    expect(validator.validate('', TOKEN)).toBe(false);
    expect(validator.validate(TOKEN, '')).toBe(false);
  });

  test('Rejects a token that is only a prefix of the expected one', () => {
    expect(validator.validate(TOKEN.slice(0, 5), TOKEN)).toBe(false);
  });

  test('Compares the utf-8 bytes, not the utf-16 code units', () => {
    expect(validator.validate('äöü', 'äöü')).toBe(true);
    expect(validator.validate('🔑', '🔑')).toBe(true);

    expect(validator.validate('äöü', 'aou')).toBe(false);
    expect(validator.validate('🔑', 'ab')).toBe(false);
  });

  test('Rejects strings that are equal only after unicode normalization', () => {
    expect(validator.validate('é', 'é')).toBe(false);
  });

  test('Rejects an empty token, even against another empty one', () => {
    const timingSafeEqual = vi.spyOn(Crypto, 'timingSafeEqual');

    expect(validator.validate('', '')).toBe(false);

    expect(timingSafeEqual).not.toHaveBeenCalled();
  });

  test('Compares in constant time', () => {
    const timingSafeEqual = vi.spyOn(Crypto, 'timingSafeEqual');

    validator.validate(TOKEN, TOKEN);

    expect(timingSafeEqual).toHaveBeenCalledExactlyOnceWith(Buffer.from(TOKEN, 'utf-8'), Buffer.from(TOKEN, 'utf-8'));
  });

  test('Does not call the constant-time comparison for mismatching lengths', () => {
    const timingSafeEqual = vi.spyOn(Crypto, 'timingSafeEqual');

    expect(validator.validate(TOKEN, `${TOKEN}extra`)).toBe(false);

    expect(timingSafeEqual).not.toHaveBeenCalled();
  });
});
