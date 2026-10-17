export type TmdbErrorOptions = ErrorOptions & {
  /** A later attempt might succeed (e.g. server errors or bans) */
  isTransient?: boolean,
};

export class TmdbError extends Error {
  override name = this.constructor.name;
  public readonly isTransient: boolean;

  /** @internal */
  constructor(message: string, options?: TmdbErrorOptions) {
    super(message, options);

    this.isTransient = options?.isTransient ?? false;
  }
}
