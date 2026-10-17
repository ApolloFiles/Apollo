import { ExternalApiErrorClassifier } from '../../ExternalApiErrorClassifier.js';
import { AniDbError } from './AniDbError.js';

/** @internal */
export class AniDbErrorClassifier {
  static isTransient(err: unknown): boolean {
    if (err instanceof AniDbError) {
      return err.isTransient;
    }

    return ExternalApiErrorClassifier.isTransientNetworkError(err);
  }
}
