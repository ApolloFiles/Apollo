import ApolloFileURI from '../../../../../uri/ApolloFileURI.js';

export default class MediaLibraryMedia {
  constructor(
    public readonly id: bigint,
    public readonly title: string,
    public readonly synopsis: string | null,
    public readonly directoryUri: ApolloFileURI,
    public readonly addedAt: Date,
    public readonly externalApiFetchedAt: Date | null,
    public readonly libraryId: bigint,
    public readonly libraryOwnerId: string,
  ) {
  }

  public static fromData(data: {
    id: bigint,
    title: string,
    synopsis: string | null,
    directoryUri: string,
    addedAt: Date,
    externalApiFetchedAt: Date | null,
    library: {
      id: bigint,
      ownerId: string,
    },
  }): MediaLibraryMedia {
    return new MediaLibraryMedia(
      data.id,
      data.title,
      data.synopsis,
      ApolloFileURI.parse(data.directoryUri),
      data.addedAt,
      data.externalApiFetchedAt,
      data.library.id,
      data.library.ownerId,
    );
  }
}
