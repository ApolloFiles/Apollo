import type VideoPlayerBackend from './backends/VideoPlayerBackend';
import SeekThumbnails from './player-extras/SeekThumbnails';

export default class VideoPlayerExtras {
  private readonly _seekThumbnails: SeekThumbnails | null = null;

  constructor(backend: VideoPlayerBackend) {
    //    const apolloFileUrl = backend.backendOptions.apollo?.fileUrl;
    //    if (apolloFileUrl != null) {
    //      this._seekThumbnails = new SeekThumbnails(`/api/v0/media/video-seek-thumbnails?file=${encodeURIComponent(apolloFileUrl)}`);
    //    } else {
    this._seekThumbnails = new SeekThumbnails(`/api/v0/media/player-session/video-seek-thumbnails`);
    //    }
  }

  get seekThumbnails(): SeekThumbnails | null {
    return this._seekThumbnails;
  }

  destroy(): void {
    this._seekThumbnails?.destroyPreloadedImages();
  }
}
