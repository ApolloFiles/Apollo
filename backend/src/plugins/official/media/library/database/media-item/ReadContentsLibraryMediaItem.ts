export default class ReadContentsLibraryMediaItem {
  /**
   * @internal
   */
  constructor(
    public readonly id: bigint,
    public readonly title: string,
    public readonly synopsis: string | null,
    public readonly addedAt: Date,
    public readonly durationInSec: number,
    public readonly episodeNumber: number | null,
    public readonly seasonNumber: number | null,
    public readonly mediaId: bigint,
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
    durationInSec: number,
    episodeNumber: number | null,
    seasonNumber: number | null,
    media: {
      id: bigint,
      library: {
        id: bigint,
        ownerId: string,
      },
    },
  }): ReadContentsLibraryMediaItem {
    return new ReadContentsLibraryMediaItem(
      data.id,
      data.title,
      data.synopsis,
      data.addedAt,
      data.durationInSec,
      data.episodeNumber,
      data.seasonNumber,

      data.media.id,
      data.media.library.id,
      data.media.library.ownerId,
    );
  }
}
