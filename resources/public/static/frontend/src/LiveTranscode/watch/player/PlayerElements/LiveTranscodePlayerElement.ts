import Hls, { HlsConfig } from 'hls.js';
import HlsPlayerElement from './HlsPlayerElement';

export default class LiveTranscodePlayerElement extends HlsPlayerElement {
  private liveTranscodeDuration?: number;

  constructor(container: HTMLElement, hlsOptions: Partial<HlsConfig> = {}) {
    super(container, {...hlsOptions, autoStartLoad: false});
  }

  set duration(duration: number) {
    this.liveTranscodeDuration = duration;
  }

  get duration(): number {
    return this.liveTranscodeDuration ?? this.videoElement.duration;
  }

  async loadMedia(src: string, poster?: string): Promise<void> {
    await super.loadMedia(src, poster);
    this.hls.once(Hls.Events.MANIFEST_PARSED, () => {
      this.hls?.startLoad(0);
    });
  }
}
