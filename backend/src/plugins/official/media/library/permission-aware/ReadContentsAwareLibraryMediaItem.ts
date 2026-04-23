import ReadContentsLibraryMediaItem from '../database/media-item/ReadContentsLibraryMediaItem.js';

export default class ReadContentsAwareLibraryMediaItem {
  constructor(
    public readonly mediaItem: ReadContentsLibraryMediaItem,
  ) {
  }
}
