import SubtitleTrack from './SubtitleTrack';

/**
 * Represents an image-based (Blu-ray PGS / DVD VOBSUB / DVB) subtitle stream that is rendered by the backend
 * directly onto the video ("hard subs"). There is nothing to render client-side: (de-)selecting it restarts the
 * live transcode with a different video stream. See {@link VideoLiveTranscodeBackend.setActiveSubtitleTrack}.
 */
export default class BurnedInSubtitleTrack extends SubtitleTrack {
  private active = false;

  constructor(
    public readonly id: string,
    public readonly label: string,
    public readonly language: string,
    public readonly streamIndex: number,
  ) {
    super();
  }

  override get isBitmapBased(): boolean {
    return true;
  }

  protected get isActive(): boolean {
    return this.active;
  }

  activate(): void {
    // No-op: the subtitle is burned into the video stream by the backend.
    this.active = true;
  }

  deactivate(): void {
    this.active = false;
  }
}
