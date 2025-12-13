export default class MediaLibrary {
  constructor(
    public readonly id: bigint,
    public readonly ownerId: string,
    public readonly name: string,
    public readonly directoryUris: string[],
  ) {
  }

  public static fromData(data: {
    id: bigint,
    ownerId: string,
    name: string,
    directoryUris: string[],
  }): MediaLibrary {
    return new MediaLibrary(
      data.id,
      data.ownerId,
      data.name,
      data.directoryUris,
    );
  }
}
