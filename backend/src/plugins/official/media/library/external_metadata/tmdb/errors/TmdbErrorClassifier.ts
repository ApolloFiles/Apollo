import { ExternalApiErrorClassifier } from '../../ExternalApiErrorClassifier.js';
import { TmdbError } from './TmdbError.js';

/** @internal */
export class TmdbErrorClassifier {
  static isTransient(err: unknown): boolean {
    if (err instanceof TmdbError) {
      return err.isTransient;
    }

    return ExternalApiErrorClassifier.isTransientNetworkError(err);
  }
}
