import Hls, { HlsConfig } from 'hls.js';
import HTMLVideoElementWrapper from './HTMLVideoElementWrapper';

export default class HlsVideoWrapper extends HTMLVideoElementWrapper {
  private readonly hls?: Hls;

  constructor(videoElement: HTMLVideoElement, hlsOptions: Partial<HlsConfig> = {debug: true, autoStartLoad: false}) {
    super(videoElement);

    if (Hls.isSupported()) {
      this.hls = new Hls(hlsOptions);
    }
  }

  async loadMedia(mediaUri: string): Promise<void> {
    if (!this.hls) {
      return super.loadMedia(mediaUri);
    }

    this.hls.loadSource(mediaUri);
    this.hls.attachMedia(this.videoElement);
    this.hls.once(Hls.Events.MANIFEST_PARSED, () => {
      this.hls?.startLoad(0);
    });
  }

  destroyWrapper() {
    this.hls?.destroy();
    super.destroyWrapper();
  }
}
