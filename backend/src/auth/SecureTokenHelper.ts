import Crypto from 'node:crypto';
import { singleton } from 'tsyringe';
import SecureRandomBase62Generator from './SecureRandomBase62Generator.js';

@singleton()
export default class SecureTokenHelper {
  static readonly TOKEN_LENGTH = 43;

  constructor(
    private readonly randomBase62Generator: SecureRandomBase62Generator,
  ) {
  }

  create(): { value: string, sha256sum: Buffer<ArrayBuffer> } {
    const token = this.randomBase62Generator.generate(SecureTokenHelper.TOKEN_LENGTH);

    return {
      value: token,
      sha256sum: this.hashToken(token),
    };
  }

  hashToken(token: string): Buffer<ArrayBuffer> {
    return Crypto.hash('sha256', token, { outputEncoding: 'buffer' });
  }
}
