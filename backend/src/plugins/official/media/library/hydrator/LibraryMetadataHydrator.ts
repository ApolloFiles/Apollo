import { singleton } from 'tsyringe';
import MediaLibraryMediaFinder from '../database/finder/MediaLibraryMediaFinder.js';
import type MediaLibrary from '../database/MediaLibrary.js';
import MediaMetadataHydrator from './MediaMetadataHydrator.js';

@singleton()
export default class LibraryMetadataHydrator {
  constructor(
    private readonly mediaLibraryMediaFinder: MediaLibraryMediaFinder,
    private readonly mediaMetadataHydrator: MediaMetadataHydrator,
  ) {
  }

  async hydrateNeeded(library: MediaLibrary): Promise<number> {
    let totalHydrated = 0;

    const allMedia = await this.mediaLibraryMediaFinder.findByLibraryId(library.id);
    for (const media of allMedia) {
      if (media.externalApiFetchedAt == null) {
        try {
          await this.mediaMetadataHydrator.hydrate(media);
          ++totalHydrated;
        } catch (err) {
          console.error(`Failed to hydrate media ID ${media.id}:`, err);
        }
      }
    }

    return totalHydrated;
  }
}
