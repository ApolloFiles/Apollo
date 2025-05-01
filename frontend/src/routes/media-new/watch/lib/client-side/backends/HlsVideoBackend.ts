import Hls, { type HlsConfig } from 'hls.js';
import HtmlVideoPlayerBackend, { type HtmlVideoPlayerBackendOptions } from './HtmlVideoPlayerBackend';

export interface HlsVideoBackendOptions extends HtmlVideoPlayerBackendOptions {
  backend: HtmlVideoPlayerBackendOptions['backend'] & {
    hlsConfig?: Partial<HlsConfig>,

    initialAudioTrack?: number,
    initialSubtitleTrack?: number,
  };
}

export default class HlsVideoBackend<T extends HlsVideoBackendOptions = HlsVideoBackendOptions> extends HtmlVideoPlayerBackend<T> {
  protected readonly hls: Hls;
  private waitForAudioBufferFlush = false;

  protected constructor(container: HTMLDivElement, options: T) {
    super(container, options);

    this.hls = new Hls(options.backend.hlsConfig);
    this.hls.attachMedia(this.videoElement);

    this.hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, () => this.onAudioTrackSwitched());
    this.hls.on(Hls.Events.MANIFEST_LOADED, () => {
      if (options.backend.initialAudioTrack != null) {
        this.hls.audioTrack = options.backend.initialAudioTrack;
      }
      if (options.backend.initialSubtitleTrack != null) {
        this.hls.subtitleTrack = options.backend.initialSubtitleTrack;
      }
    });

    this.hls.loadSource(options.backend.src);
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

  getAudioTracks(): { id: string, label: string }[] {
    return this.hls.audioTracks
      .map((track) => ({
        id: track.id.toString(),
        label: track.name || `${track.type.toLowerCase()}${track.lang ? ` (${track.lang})` : ''}`,
      }));
  }

  getActiveSubtitleTrackId(): string | null {
    if (!this.hls.subtitleDisplay) {
      return null;
    }
    return this.hls.subtitleTrack.toString();
  }

  setActiveSubtitleTrack(id: string | null): void {
    if (id == null) {
      this.hls.subtitleDisplay = false;
      return;
    }

    this.hls.subtitleTrack = parseInt(id, 10);
    this.hls.subtitleDisplay = true;
  }

  getSubtitleTracks(): { id: string; label: string }[] {
    return this.hls.subtitleTracks
      .map((track) => ({
        id: track.id.toString(),
        label: track.name || `${track.type.toLowerCase()}${track.lang ? ` (${track.lang})` : ''}`,
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
      this.currentTime -= 0.001;
    } else {
      this.currentTime += 0.001;
    }
  }

  static async create(container: HTMLDivElement, options: HlsVideoBackendOptions): Promise<HlsVideoBackend> {
    return new HlsVideoBackend(container, options);
  }
}
