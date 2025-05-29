import HlsVideoBackend, { type HlsVideoBackendOptions } from './HlsVideoBackend';

export interface VideoLiveTranscodeBackendOptions extends HlsVideoBackendOptions {
  backend: HlsVideoBackendOptions['backend'] & {
    totalDurationInSeconds: number,
    startOffset: number,
    restartTranscode: (startOffset: number, activeAudioTrack: number, activeSubtitleTrack: number) => void,
  };
}

// TODO: Maybe inheritance is annoying and we should 'decorate' instead?
//       Less unexpected side-effects from underlying implementation, more explicit using it when it makes sense
export default class VideoLiveTranscodeBackend<T extends VideoLiveTranscodeBackendOptions = VideoLiveTranscodeBackendOptions> extends HlsVideoBackend<T> {
  protected constructor(container: HTMLDivElement, options: T) {
    super(container, options);
  }

  get duration(): number {
    return this.backendOptions.backend.totalDurationInSeconds;
  }

  get currentTime(): number {
    return super.currentTime + this.backendOptions.backend.startOffset;
  }

  seek(time: number, stillSeeking = false): void {
    // waiting a bit for the stream to catch up should be way faster than waiting for the transcode to restart
    const SEEK_INTO_FUTURE_TOLERANCE = 5;
    const maxPossibleTime = this.backendOptions.backend.startOffset + super.duration + SEEK_INTO_FUTURE_TOLERANCE;

    time = Math.max(0, Math.min(time, this.backendOptions.backend.totalDurationInSeconds));

    if (!stillSeeking && (time < this.backendOptions.backend.startOffset || time > maxPossibleTime)) {
      this.backendOptions.backend.restartTranscode(Math.floor(time), this.hls.audioTrack, this.hls.subtitleTrack);
      return;
    }

    super.seek(time - this.backendOptions.backend.startOffset, stillSeeking);
  }

  fastSeek(time: number, stillSeeking = false): void {
    this.seek(time, stillSeeking);
  }

  getBufferedRanges(): { start: number; end: number }[] {
    const bufferedRanges = super.getBufferedRanges();
    for (const bufferedRange of bufferedRanges) {
      bufferedRange.start += this.backendOptions.backend.startOffset;
      bufferedRange.end += this.backendOptions.backend.startOffset;
    }
    return bufferedRanges;
  }

  getRemotelyBufferedRange(): { start: number; end: number } | null {
    return {
      start: this.backendOptions.backend.startOffset,
      end: super.duration + this.backendOptions.backend.startOffset,
    };
  }

  static async create(container: HTMLDivElement, options: VideoLiveTranscodeBackendOptions): Promise<VideoLiveTranscodeBackend> {
    return new VideoLiveTranscodeBackend(container, options);
  }
}
