import Hls, { type HlsConfig } from 'hls.js';
import HtmlVideoPlayerBackend, { type HtmlVideoPlayerBackendOptions } from './HtmlVideoPlayerBackend';

export interface HlsVideoBackendOptions extends HtmlVideoPlayerBackendOptions {
  backend: HtmlVideoPlayerBackendOptions['backend'] & {
    hls?: Partial<HlsConfig>
  };
}

export default class HlsVideoBackend<T extends HlsVideoBackendOptions = HlsVideoBackendOptions> extends HtmlVideoPlayerBackend<T> {
  public readonly shouldShowCustomControls = true;

  protected readonly hls: Hls;

  protected constructor(container: HTMLDivElement, options: T) {
    super(container, options);

    this.hls = new Hls(options.backend.hls);
    this.hls.attachMedia(this.videoElement);

    this.hls.loadSource(options.backend.src);
  }

  getAudioTracks(): { id: string, label: string }[] {
    return this.hls.audioTracks
      .map((track) => ({
        id: track.id.toString(),
        label: track.name || `${track.type.toLowerCase()}${track.lang ? ` (${track.lang})` : ''}`,
      }));
  }

  destroy(): void {
    this.hls.destroy();
    super.destroy();
  }

  static async create(container: HTMLDivElement, options: HlsVideoBackendOptions): Promise<HlsVideoBackend> {
    return new HlsVideoBackend(container, options);
  }
}
