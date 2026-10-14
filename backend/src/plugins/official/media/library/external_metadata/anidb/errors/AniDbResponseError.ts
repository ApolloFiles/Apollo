import type { AniDbErrorResponse } from '../transport/ErrorSchema.js';
import { AniDbError } from './AniDbError.js';

type ConstructorOptions = ErrorOptions & {
  errorText: string,
  errorCode: number | undefined,
};

export class AniDbResponseError extends AniDbError {
  public readonly errorText: string;
  public readonly errorCode: number | undefined;

  /** @internal */
  constructor(message: string, options: ConstructorOptions) {
    super(message, { ...options, isTransient: AniDbResponseError.looksLikeBan(options.errorText) });

    this.errorText = options.errorText;
    this.errorCode = options.errorCode;
  }

  /** There is no official documentation on how to detect a ban, so this matches more than the documented "Banned" */
  get isBan(): boolean {
    return AniDbResponseError.looksLikeBan(this.errorText);
  }

  /** @internal */
  static create(error: AniDbErrorResponse): AniDbResponseError {
    let message = `AniDB API responded with an error: ${error.errorText}`;
    if (error.errorCode != null) {
      message += ` (code=${error.errorCode})`;
    }

    return new AniDbResponseError(message, error);
  }

  private static looksLikeBan(errorText: string): boolean {
    return errorText.toLowerCase().includes('banned');
  }
}
