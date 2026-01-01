import Crypto from 'node:crypto';
import { singleton } from 'tsyringe';

@singleton()
export default class SecureTokenHelper {
  create(): { value: string, sha256sum: Buffer<ArrayBuffer> } {
    const token = Crypto.randomBytes(64);

    return {
      value: token.toString('base64url'),
      sha256sum: this.hashToken(token),
    };
  }

  hashToken(token: string | Buffer): Buffer<ArrayBuffer> {
    if (!Buffer.isBuffer(token)) {
      token = this.decodeHashedToken(token);
    }
    return Crypto.hash('sha256', token, { outputEncoding: 'buffer' });
  }

  stringifyHashedToken(hashedToken: NodeJS.ArrayBufferView): string {
    return Buffer
      .from(hashedToken.buffer, hashedToken.byteOffset, hashedToken.byteLength)
      .toString('base64url');
  }

  decodeHashedToken(hashedToken: string): Buffer<ArrayBuffer> {
    return Buffer.from(hashedToken, 'base64url');
  }
}
