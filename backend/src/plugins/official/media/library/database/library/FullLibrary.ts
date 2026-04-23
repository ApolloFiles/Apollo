import ReadContentsLibrary from './ReadContentsLibrary.js';

export default class FullLibrary extends ReadContentsLibrary {
  /**
   * @internal
   */
  constructor(
    id: bigint,
    ownerId: string,
    name: string,
    public readonly directoryUris: string[],
    public readonly sharedWithUsers: { id: string, displayName: string }[],
  ) {
    super(id, ownerId, name);
  }

  /**
   * @internal
   */
  public static fromData(data: {
    id: bigint,
    ownerId: string,
    name: string,
    directoryUris: string[],
    MediaLibrarySharedWith: { user: { id: string, displayName: string } }[],
  }): FullLibrary {
    return new FullLibrary(
      data.id,
      data.ownerId,
      data.name,
      data.directoryUris,
      data.MediaLibrarySharedWith.map(data => data.user),
    );
  }
}
