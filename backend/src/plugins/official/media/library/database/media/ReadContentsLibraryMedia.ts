export default class ReadContentsLibraryMedia {
  /**
   * @internal
   */
  constructor(
    public readonly id: bigint,
    public readonly title: string,
    public readonly synopsis: string | null,
    public readonly addedAt: Date,
    public readonly libraryId: bigint,
    public readonly libraryOwnerId: string,
  ) {
  }

  /**
   * @internal
   */
  public static fromData(data: {
    id: bigint,
    title: string,
    synopsis: string | null,
    addedAt: Date,
    library: { id: bigint, ownerId: string },
  }): ReadContentsLibraryMedia {
    return new ReadContentsLibraryMedia(
      data.id,
      data.title,
      data.synopsis,
      data.addedAt,

      data.library.id,
      data.library.ownerId,
    );
  }
}
