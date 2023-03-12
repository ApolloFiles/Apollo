import Hls, { HlsConfig } from 'hls.js';
import HTMLVideoElementWrapper from './HTMLVideoElementWrapper';

export default class HlsVideoWrapper extends HTMLVideoElementWrapper {
  private readonly hls?: Hls;
  private mediaUri?: string;

  constructor(videoElement: HTMLVideoElement, hlsOptions: Partial<HlsConfig> = {debug: false, autoStartLoad: false}) {
    super(videoElement);

    if (Hls.isSupported()) {
      this.hls = new Hls(hlsOptions);
    }
  }

  async loadMedia(mediaUri: string): Promise<void> {
    if (!this.hls) {
      this.mediaUri = undefined;
      return super.loadMedia(mediaUri);
    }

    this.hls.loadSource(mediaUri);
    this.hls.attachMedia(this.videoElement);
    this.hls.once(Hls.Events.MANIFEST_PARSED, () => {
      this.hls?.startLoad(0);
    });

    this.mediaUri = mediaUri;
  }

  getLoadedMediaUri(): string | null {
    if (!this.hls) {
      return super.getLoadedMediaUri();
    }

    return this.mediaUri ?? null;
  }

  destroyWrapper() {
    this.hls?.destroy();
    super.destroyWrapper();
  }
}
