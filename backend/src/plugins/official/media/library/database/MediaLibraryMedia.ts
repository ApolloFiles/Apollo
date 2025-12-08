export default class MediaLibraryMedia {
  constructor(
    public readonly id: bigint,
    public readonly title: string,
    public readonly synopsis: string | null,
    public readonly directoryPath: string,
    public readonly addedAt: Date,
    public readonly libraryId: bigint,
    public readonly libraryOwnerId: string,
  ) {
  }

  public static fromData(data: {
    id: bigint,
    title: string,
    synopsis: string | null,
    directoryPath: string,
    addedAt: Date,
    library: {
      id: bigint,
      ownerId: string,
    },
  }): MediaLibraryMedia {
    return new MediaLibraryMedia(
      data.id,
      data.title,
      data.synopsis,
      data.directoryPath,
      data.addedAt,
      data.library.id,
      data.library.ownerId,
    );
  }
}
