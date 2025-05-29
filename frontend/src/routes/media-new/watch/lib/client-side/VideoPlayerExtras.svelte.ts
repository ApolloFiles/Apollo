import SeekThumbnails from './player-extras/SeekThumbnails';

export default class VideoPlayerExtras {
  private readonly _seekThumbnails: SeekThumbnails | null = null;

  constructor(sessionId: string) {
    this._seekThumbnails = new SeekThumbnails(`/api/v0/media/player-session/${encodeURIComponent(sessionId)}/video-seek-thumbnails`);
  }

  get seekThumbnails(): SeekThumbnails | null {
    return this._seekThumbnails;
  }

  destroy(): void {
    this._seekThumbnails?.destroyPreloadedImages();
  }
}
