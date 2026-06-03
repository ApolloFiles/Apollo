import ApolloFileURI from '../../../../../../uri/ApolloFileURI.js';
import ReadContentsLibraryMedia from './ReadContentsLibraryMedia.js';

export default class FullLibraryMedia extends ReadContentsLibraryMedia {
  /**
   * @internal
   */
  constructor(
    id: bigint,
    title: string,
    synopsis: string | null,
    year: number | null,
    addedAt: Date,
    libraryId: bigint,
    libraryOwnerId: string,
    public readonly directoryUri: ApolloFileURI,
    public readonly externalApiFetchedAt: Date | null,
  ) {
    super(id, title, synopsis, year, addedAt, libraryId, libraryOwnerId);
  }

  /**
   * @internal
   */
  public static fromData(data: {
    id: bigint,
    title: string,
    synopsis: string | null,
    year: number | null,
    addedAt: Date,
    library: { id: bigint, ownerId: string },
    directoryUri: string,
    externalApiFetchedAt: Date | null,
  }): FullLibraryMedia {
    return new FullLibraryMedia(
      data.id,
      data.title,
      data.synopsis,
      data.year,
      data.addedAt,

      data.library.id,
      data.library.ownerId,

      ApolloFileURI.parse(data.directoryUri),
      data.externalApiFetchedAt,
    );
  }
}
