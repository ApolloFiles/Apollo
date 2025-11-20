import Hls from 'hls.js';
import SubtitleTrack from './SubtitleTrack';

export default class HlsSubtitleTrack extends SubtitleTrack {
  constructor(
    public readonly trackNumber: number,
    public readonly label: string,
    public readonly language: string,
    private readonly hls: Hls,
  ) {
    super();
  }

  get id(): string {
    return `hls_${this.trackNumber}`;
  }

  activate(): void {
    this.hls.subtitleTrack = this.trackNumber;
    this.hls.subtitleDisplay = true;
  }

  deactivate(): void {
    this.hls.subtitleDisplay = false;
  }
}
