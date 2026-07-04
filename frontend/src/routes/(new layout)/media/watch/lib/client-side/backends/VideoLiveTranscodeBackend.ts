import BurnedInSubtitleTrack from './subtitles/BurnedInSubtitleTrack';
import HlsVideoBackend, { type HlsVideoBackendOptions } from './HlsVideoBackend';

export interface VideoLiveTranscodeBackendOptions extends HlsVideoBackendOptions {
  backend: HlsVideoBackendOptions['backend'] & {
    totalDurationInSeconds: number,
    startOffset: number,
    /** The stream index of the image-based subtitle currently burned into the video, or `null` if none. */
    activeBurnedInSubtitleStreamIndex: number | null,
    restartTranscode: (startOffset: number, activeAudioTrack: number, activeSubtitleTrack: number) => void,
    /**
     * Restarts the (shared) live transcode with a different burned-in subtitle selection.
     * @param streamIndex the image-based subtitle stream to burn in, or `null` to burn none.
     * @param startOffset the playback position (seconds) to resume the restarted transcode at.
     * @param activeAudioTrack the HLS audio track to keep selected across the restart.
     * @param desiredSoftSubtitleIdAfterReload a soft/text subtitle track id to (re-)activate once the new stream has loaded, or `null`.
     */
    changeBurnedInSubtitle: (streamIndex: number | null, startOffset: number, activeAudioTrack: number, desiredSoftSubtitleIdAfterReload: string | null) => void,
  };
}

// TODO: Maybe inheritance is annoying and we should 'decorate' instead?
//       Less unexpected side-effects from underlying implementation, more explicit using it when it makes sense
export default class VideoLiveTranscodeBackend<T extends VideoLiveTranscodeBackendOptions = VideoLiveTranscodeBackendOptions> extends HlsVideoBackend<T> {
  protected constructor(container: HTMLDivElement, options: T) {
    super(container, options);

    for (const subtitleTrack of this.subtitleTracks) {
      subtitleTrack.setVideoStatOffset(options.backend.startOffset);
    }

    // Reflect the currently burned-in (hard) subtitle as the active track, without triggering another restart.
    if (options.backend.activeBurnedInSubtitleStreamIndex != null) {
      const burnedInTrack = this.subtitleTracks.find(
        (track): track is BurnedInSubtitleTrack => track instanceof BurnedInSubtitleTrack && track.streamIndex === options.backend.activeBurnedInSubtitleStreamIndex,
      );
      if (burnedInTrack != null) {
        this.activeSubtitleTrack = burnedInTrack;
        burnedInTrack.activate();
      }
    }
  }

  override setActiveSubtitleTrack(subtitleTrackId: string | null): void {
    const target = subtitleTrackId == null ? null : this.subtitleTracks.find((track) => track.id === subtitleTrackId) ?? null;
    const targetIsBitmap = target instanceof BurnedInSubtitleTrack;
    const currentIsBitmap = this.activeSubtitleTrack instanceof BurnedInSubtitleTrack;

    // If neither the target nor the current selection is a burned-in subtitle, this is a normal client-side switch.
    if (!targetIsBitmap && !currentIsBitmap) {
      super.setActiveSubtitleTrack(subtitleTrackId);
      return;
    }

    // A burned-in (hard) subtitle is involved -> the whole transcode has to restart with a different video stream.
    const newBurnInStreamIndex = targetIsBitmap ? target.streamIndex : null;
    const desiredSoftSubtitleIdAfterReload = (!targetIsBitmap && target != null) ? target.id : null;
    this.backendOptions.backend.changeBurnedInSubtitle(
      newBurnInStreamIndex,
      Math.floor(this.currentTime),
      this.hls.audioTrack,
      desiredSoftSubtitleIdAfterReload,
    );
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
