import { AniDbError } from './AniDbError.js';

export class AniDbParseError extends AniDbError {
  /** @internal */
  static createForAnime(animeId: number, cause: unknown): AniDbParseError {
    return new AniDbParseError(`Unable to parse the AniDB XML of anime ${animeId}`, { cause });
  }
}
