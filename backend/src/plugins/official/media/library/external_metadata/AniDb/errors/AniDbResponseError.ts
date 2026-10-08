import type { AniDbErrorResponse } from '../transport/ErrorSchema.js';
import { AniDbError } from './AniDbError.js';

type ConstructorOptions = ErrorOptions & {
  errorText: string,
  errorCode: number | undefined,
};

export class AniDbResponseError extends AniDbError {
  public readonly errorText: string;
  public readonly errorCode: number | undefined;

  constructor(message: string, options: ConstructorOptions) {
    super(message, options);

    this.errorText = options.errorText;
    this.errorCode = options.errorCode;
  }

  /** @internal */
  static create(error: AniDbErrorResponse): AniDbResponseError {
    let message = `AniDB API responded with an error: ${error.errorText}`;
    if (error.errorCode != null) {
      message += ` (code=${error.errorCode})`;
    }

    return new AniDbResponseError(message, error);
  }
}
