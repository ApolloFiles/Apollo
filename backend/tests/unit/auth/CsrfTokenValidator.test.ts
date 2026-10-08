import Crypto from 'node:crypto';
import CsrfTokenValidator from '#src/auth/CsrfTokenValidator.js';

const TOKEN = 'HR7dQpZ2mKf0aVxLnB4tYs1';

describe(CsrfTokenValidator, () => {
  let validator: CsrfTokenValidator;

  beforeEach(() => {
    validator = new CsrfTokenValidator();
  });

  test('Accepts two identical tokens', () => {
    expect(validator.validate(TOKEN, 'HR7dQpZ2mKf0aVxLnB4tYs1')).toBe(true);
  });

  test.for([
    { position: 'last', sent: 'HR7dQpZ2mKf0aVxLnB4tYsX', expected: TOKEN },
    { position: 'first', sent: 'XR7dQpZ2mKf0aVxLnB4tYs1', expected: TOKEN },
  ])('Rejects tokens that differ in the $position character', ({ sent, expected }) => {
    expect(validator.validate(sent, expected)).toBe(false);
  });

  test('Rejects tokens that differ only in case', () => {
    expect(validator.validate('hr7dqpz2mkf0avxlnb4tys1', 'HR7DQPZ2MKF0AVXLNB4TYS1')).toBe(false);
  });

  test.for([
    { sent: TOKEN, expected: `${TOKEN}extra` },
    { sent: `${TOKEN}extra`, expected: TOKEN },
    { sent: '', expected: TOKEN },
    { sent: TOKEN, expected: '' },
  ])('Rejects tokens of different length instead of throwing ("$sent" vs. "$expected")', ({ sent, expected }) => {
    expect(validator.validate(sent, expected)).toBe(false);
  });

  test('Rejects a token that is only a prefix of the expected one', () => {
    expect(validator.validate('HR7dQ', TOKEN)).toBe(false);
  });

  test.for([
    { token: 'äöü' },
    { token: '🔑' },
  ])('Accepts the identical non-ASCII token $token', ({ token }) => {
    expect(validator.validate(token, token)).toBe(true);
  });

  test.for([
    { sent: 'äöü', expected: 'aou' },
    { sent: '🔑', expected: 'ab' },
  ])('Rejects $sent against $expected, which has as many UTF-16 code units', ({ sent, expected }) => {
    expect(validator.validate(sent, expected)).toBe(false);
  });

  test('Rejects strings that are equal only after unicode normalization', () => {
    expect(validator.validate('\u00e9', 'e\u0301')).toBe(false);
  });

  test('Rejects an empty token, even against another empty one', () => {
    expect(validator.validate('', '')).toBe(false);
  });

  test('Compares in constant time', () => {
    const timingSafeEqual = vi.spyOn(Crypto, 'timingSafeEqual');

    validator.validate(TOKEN, TOKEN);

    expect(timingSafeEqual).toHaveBeenCalledExactlyOnceWith(Buffer.from(TOKEN, 'utf-8'), Buffer.from(TOKEN, 'utf-8'));
  });
});
