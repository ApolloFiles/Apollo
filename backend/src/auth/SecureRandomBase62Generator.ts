import Crypto from 'node:crypto';
import { singleton } from 'tsyringe';

@singleton()
export default class SecureRandomBase62Generator {
  private static readonly ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  private static readonly LOWEST_BIASED_BYTE_VALUE = 256 - (256 % SecureRandomBase62Generator.ALPHABET.length);

  generate(length: number): string {
    if (!Number.isInteger(length) || length < 0) {
      throw new Error(`Expected 'length' to be a non-negative integer but got ${length}`);
    }

    let generated = '';
    while (generated.length < length) {
      const randomBytes = Crypto.randomBytes(length - generated.length);
      generated += SecureRandomBase62Generator.mapUnbiasedBytesToChars(randomBytes);
    }

    return generated;
  }

  private static mapUnbiasedBytesToChars(bytes: Buffer): string {
    let chars = '';
    for (const byte of bytes) {
      if (byte < SecureRandomBase62Generator.LOWEST_BIASED_BYTE_VALUE) {
        chars += SecureRandomBase62Generator.ALPHABET[byte % SecureRandomBase62Generator.ALPHABET.length];
      }
    }
    return chars;
  }
}
