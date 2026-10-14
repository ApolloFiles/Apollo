export type AniDbErrorOptions = ErrorOptions & {
  /** A later attempt might succeed (e.g. server errors or bans) */
  isTransient?: boolean,
};

export class AniDbError extends Error {
  override name = this.constructor.name;
  public readonly isTransient: boolean;

  /** @internal */
  constructor(message: string, options?: AniDbErrorOptions) {
    super(message, options);

    this.isTransient = options?.isTransient ?? false;
  }
}
