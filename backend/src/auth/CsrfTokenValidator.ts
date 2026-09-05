import Crypto from 'node:crypto';
import { singleton } from 'tsyringe';

@singleton()
export default class CsrfTokenValidator {
  validate(a: string, b: string): boolean {
    if (a.length === 0 || b.length === 0) {
      return false;
    }

    const aBuffer = Buffer.from(a, 'utf-8');
    const bBuffer = Buffer.from(b, 'utf-8');

    return aBuffer.byteLength === bBuffer.byteLength && Crypto.timingSafeEqual(aBuffer, bBuffer);
  }
}
