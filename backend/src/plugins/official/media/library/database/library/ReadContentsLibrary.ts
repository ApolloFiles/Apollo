export default class ReadContentsLibrary {
  /**
   * @internal
   */
  constructor(
    public readonly id: bigint,
    public readonly ownerId: string,
    public readonly name: string,
  ) {
  }

  /**
   * @internal
   */
  public static fromData(data: {
    id: bigint,
    ownerId: string,
    name: string,
  }): ReadContentsLibrary {
    return new ReadContentsLibrary(
      data.id,
      data.ownerId,
      data.name,
    );
  }
}
