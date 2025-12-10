export default class MediaLibraryMediaItem {
  constructor(
    public readonly id: bigint,
    public readonly filePath: string,
    public readonly title: string,
    public readonly synopsis: string | null,
    public readonly lastScannedAt: Date,
    public readonly addedAt: Date,
    public readonly durationInSec: number,
    public readonly episodeNumber: number | null,
    public readonly seasonNumber: number | null,
    public readonly mediaId: bigint,
    public readonly libraryId: bigint,
    public readonly libraryOwnerId: string,
  ) {
  }

  public static fromData(data: {
    id: bigint,
    filePath: string,
    title: string,
    synopsis: string | null,
    lastScannedAt: Date,
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
  }): MediaLibraryMediaItem {
    return new MediaLibraryMediaItem(
      data.id,
      data.filePath,
      data.title,
      data.synopsis,
      data.lastScannedAt,
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
