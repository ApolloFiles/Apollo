import Hls, { HlsConfig } from 'hls.js';
import NativePlayerElement from './NativePlayerElement';

export default class HlsPlayerElement extends NativePlayerElement {
  protected readonly hls: Hls;

  constructor(container: HTMLElement, hlsOptions?: Partial<HlsConfig>) {
    super(container);

    this.hls = new Hls(hlsOptions);
    this.hls.attachMedia(this.videoElement);
  }

  async loadMedia(src: string, poster?: string): Promise<void> {
    await this.hls.loadSource(src);
  }

  destroyPlayer(): void {
    this.hls.destroy();
    super.destroyPlayer();
  }
}
