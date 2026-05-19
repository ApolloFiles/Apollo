import Crypto from 'node:crypto';
import { singleton } from 'tsyringe';
import SecureTokenHelper from './SecureTokenHelper.js';

@singleton()
export default class CsrfTokenValidator {
  constructor(
    private readonly secureTokenHelper: SecureTokenHelper,
  ) {
  }

  validate(a: string, b: string): boolean {
    const aBuffer = this.secureTokenHelper.decodeToken(a);
    const bBuffer = this.secureTokenHelper.decodeToken(b);

    return aBuffer.byteLength === bBuffer.byteLength && Crypto.timingSafeEqual(aBuffer, bBuffer);
  }
}
