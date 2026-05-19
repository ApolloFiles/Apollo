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
      token = this.decodeToken(token);
    }
    return Crypto.hash('sha256', token, { outputEncoding: 'buffer' });
  }

  stringifyToken(tokenValue: NodeJS.ArrayBufferView): string {
    return Buffer
      .from(tokenValue.buffer, tokenValue.byteOffset, tokenValue.byteLength)
      .toString('base64url');
  }

  decodeToken(tokenValue: string): Buffer<ArrayBuffer> {
    return Buffer.from(tokenValue, 'base64url');
  }
}
