import Hls, { type HlsConfig } from 'hls.js';
import HtmlVideoPlayerBackend, { type HtmlVideoPlayerBackendOptions } from './HtmlVideoPlayerBackend';
import HlsSubtitleTrack from './subtitles/HlsSubtitleTrack';
import type { AudioTrackInfo } from './VideoPlayerBackend';

export interface HlsVideoBackendOptions extends HtmlVideoPlayerBackendOptions {
  backend: HtmlVideoPlayerBackendOptions['backend'] & {
    hlsConfig?: Partial<HlsConfig>,

    /** ISO-639 language to start playback with; ignored when no audio track matches it. */
    preferredAudioLanguage?: string,
  };
}

export default class HlsVideoBackend<T extends HlsVideoBackendOptions = HlsVideoBackendOptions> extends HtmlVideoPlayerBackend<T> {
  protected readonly hls: Hls;
  private waitForAudioBufferFlush = false;

  protected constructor(container: HTMLDivElement, options: T) {
    super(container, options);

    const hlsConfig: Partial<HlsConfig> = { ...options.backend.hlsConfig };
    if (options.backend.preferredAudioLanguage != null) {
      hlsConfig.audioPreference = { lang: options.backend.preferredAudioLanguage };
    }

    this.hls = new Hls(hlsConfig);
    this.hls.attachMedia(this.videoElement);

    this.hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, () => this.onAudioTrackSwitched());
    this.hls.once(Hls.Events.MANIFEST_LOADED, () => {
      this.hls.startLoad(this.initialStreamPosition);
    });
    this.hls.once(Hls.Events.SUBTITLE_TRACKS_UPDATED, () => {
      for (const track of this.hls.subtitleTracks) {
        const label = track.name || `${track.type.toLowerCase()}${track.lang ? ` (${track.lang})` : ''}`;
        this.addSubtitleTrack(new HlsSubtitleTrack(track.id, label, track.lang ?? 'und', this.hls));
      }
    });

    this.hls.loadSource(options.backend.src);
  }

  /** Position within the HLS stream to start loading at, in stream-local seconds. */
  protected get initialStreamPosition(): number {
    return 0;
  }

  getActiveAudioTrackId(): string | null {
    return this.hls.audioTrack.toString();
  }

  setActiveAudioTrack(id: string): void {
    const newAudioTrackId = parseInt(id, 10);
    if (this.hls.audioTrack == newAudioTrackId) {
      return;
    }

    this.waitForAudioBufferFlush = true;
    this.hls.audioTrack = newAudioTrackId;
  }

  getAudioTracks(): AudioTrackInfo[] {
    return this.hls.audioTracks
      .map((track) => ({
        id: track.id.toString(),
        label: track.name || `${track.type.toLowerCase()}${track.lang ? ` (${track.lang})` : ''}`,
        language: track.lang ?? 'und',
      }));
  }

  destroy(): void {
    this.hls.destroy();
    super.destroy();
  }

  private onAudioTrackSwitched(): void {
    if (!this.waitForAudioBufferFlush) {
      return;
    }

    this.waitForAudioBufferFlush = false;

    // Seeking is required to flush the low-level playback buffers
    if (this.currentTime < 1) {
      this.seek(this.currentTime - 0.001, false);
      this.seek(this.currentTime + 0.001, false);
    } else {
      this.seek(this.currentTime + 0.001, false);
      this.seek(this.currentTime - 0.001, false);
    }
  }

  static async create(container: HTMLDivElement, options: HlsVideoBackendOptions): Promise<HlsVideoBackend> {
    return new HlsVideoBackend(container, options);
  }
}
